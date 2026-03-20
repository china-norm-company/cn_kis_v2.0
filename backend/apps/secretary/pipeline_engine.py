"""
声明式跨技能流水线引擎

支持 YAML 定义的跨技能编排流水线：
- 顺序执行链（A → B → C）
- 并行执行组（A || B → C）
- 条件分支（if result.x > threshold then A else B）
- 错误处理和回退

示例 Pipeline YAML:
  pipeline:
    name: "recruitment-full-cycle"
    steps:
      - id: parse
        skill: protocol-parser
        script: parse_protocol
        params: {text: "$input.protocol_text"}
      - id: screen
        skill: recruitment-screener
        script: screen_applicants
        depends_on: [parse]
        params: {criteria: "$parse.output.inclusion_criteria", applicants: "$input.applicants"}
      - id: schedule
        skill: visit-scheduler
        script: schedule_visits
        depends_on: [screen]
        params: {protocol: "$parse.output", subjects: "$screen.output.passed"}
"""
import copy
import logging
import re
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional, Set

import yaml

logger = logging.getLogger(__name__)

VAR_PATTERN = re.compile(r'\$(\w+)\.(.+)')


@dataclass
class StepResult:
    """步骤执行结果"""
    step_id: str
    status: str = 'pending'
    output: Any = None
    error: str = ''
    duration_ms: int = 0
    retry_count: int = 0


@dataclass
class StepDefinition:
    """步骤定义"""
    id: str
    skill: str
    script: str
    params: Dict[str, Any] = field(default_factory=dict)
    depends_on: List[str] = field(default_factory=list)
    condition: Optional[str] = None
    timeout: int = 30
    on_failure: str = 'abort'


class PipelineDefinition:
    """解析并持有 YAML pipeline 定义"""

    def __init__(self, definition: Dict[str, Any]):
        pipeline = definition.get('pipeline', definition)
        self.name: str = pipeline.get('name', 'unnamed')
        self.description: str = pipeline.get('description', '')
        self.steps: List[StepDefinition] = []

        for s in pipeline.get('steps', []):
            self.steps.append(StepDefinition(
                id=s['id'],
                skill=s.get('skill', ''),
                script=s.get('script', ''),
                params=s.get('params', {}),
                depends_on=s.get('depends_on', []),
                condition=s.get('condition'),
                timeout=s.get('timeout', 30),
                on_failure=s.get('on_failure', 'abort'),
            ))

        self._validate()

    @classmethod
    def from_yaml(cls, yaml_str: str) -> 'PipelineDefinition':
        data = yaml.safe_load(yaml_str)
        return cls(data)

    def _validate(self):
        ids = {s.id for s in self.steps}
        for step in self.steps:
            for dep in step.depends_on:
                if dep not in ids:
                    raise ValueError(f'Step "{step.id}" depends on unknown step "{dep}"')

    def get_execution_order(self) -> List[List[StepDefinition]]:
        """拓扑排序，返回可并行执行的分层列表"""
        completed: Set[str] = set()
        remaining = list(self.steps)
        phases: List[List[StepDefinition]] = []

        max_iter = len(self.steps) + 1
        for _ in range(max_iter):
            if not remaining:
                break
            ready = [s for s in remaining if all(d in completed for d in s.depends_on)]
            if not ready:
                ready = remaining[:]
                remaining = []
            else:
                remaining = [s for s in remaining if s not in ready]
            phases.append(ready)
            completed.update(s.id for s in ready)

        return phases


class PipelineExecutor:
    """执行 pipeline，管理步骤间数据传递"""

    def __init__(
        self,
        definition: PipelineDefinition,
        initial_input: Optional[Dict[str, Any]] = None,
        max_parallel: int = 4,
        execution_context=None,  # Optional[SkillExecutionContext]
    ):
        self.definition = definition
        self.input_data = initial_input or {}
        self.max_parallel = max_parallel
        self.results: Dict[str, StepResult] = {}
        self.execution_context = execution_context  # 贯穿整条流水线的执行上下文

    def execute(self) -> Dict[str, Any]:
        """执行整条流水线，返回汇总结果"""
        start = time.monotonic()
        phases = self.definition.get_execution_order()
        errors: List[str] = []
        aborted = False

        for phase in phases:
            if aborted:
                for step in phase:
                    self.results[step.id] = StepResult(step_id=step.id, status='skipped')
                continue

            if len(phase) == 1:
                res = self._run_step(phase[0])
                self.results[res.step_id] = res
                if res.status == 'failed' and phase[0].on_failure == 'abort':
                    errors.append(f'{res.step_id}: {res.error}')
                    aborted = True
            else:
                with ThreadPoolExecutor(max_workers=min(len(phase), self.max_parallel)) as pool:
                    futures = {pool.submit(self._run_step, s): s for s in phase}
                    for future in as_completed(futures):
                        res = future.result()
                        self.results[res.step_id] = res
                        if res.status == 'failed' and futures[future].on_failure == 'abort':
                            errors.append(f'{res.step_id}: {res.error}')
                            aborted = True

        total_ms = int((time.monotonic() - start) * 1000)
        all_success = all(r.status == 'success' for r in self.results.values())

        return {
            'pipeline': self.definition.name,
            'status': 'success' if all_success else ('partial' if not aborted else 'failed'),
            'total_ms': total_ms,
            'steps': {sid: self._step_to_dict(r) for sid, r in self.results.items()},
            'errors': errors,
        }

    def _run_step(self, step: StepDefinition) -> StepResult:
        """执行单个步骤"""
        result = StepResult(step_id=step.id)

        if step.condition and not self._evaluate_condition(step.condition):
            result.status = 'skipped'
            return result

        resolved_params = self._resolve_params(step.params)

        step_start = time.monotonic()
        try:
            from .skill_executor import execute_skill
            exec_result = execute_skill(
                skill_id=step.skill,
                script_name=step.script,
                params=resolved_params,
                timeout=step.timeout,
                execution_context=self.execution_context,
            )
            result.duration_ms = int((time.monotonic() - step_start) * 1000)

            if exec_result.get('ok'):
                result.status = 'success'
                result.output = exec_result.get('output')
            else:
                result.status = 'failed'
                result.error = exec_result.get('error', 'unknown error')
        except Exception as e:
            result.duration_ms = int((time.monotonic() - step_start) * 1000)
            result.status = 'failed'
            result.error = str(e)
            logger.warning('Pipeline step %s failed: %s', step.id, e)

        return result

    def _resolve_params(self, params: Dict[str, Any]) -> Dict[str, Any]:
        """解析参数中的变量引用（$input.xxx 和 $step_id.output.xxx）"""
        resolved = {}
        for key, val in params.items():
            if isinstance(val, str):
                resolved[key] = self._resolve_value(val)
            elif isinstance(val, dict):
                resolved[key] = self._resolve_params(val)
            elif isinstance(val, list):
                resolved[key] = [
                    self._resolve_value(v) if isinstance(v, str) else v
                    for v in val
                ]
            else:
                resolved[key] = val
        return resolved

    def _resolve_value(self, value: str) -> Any:
        """解析单个变量引用"""
        match = VAR_PATTERN.match(value)
        if not match:
            return value

        source = match.group(1)
        path = match.group(2)

        if source == 'input':
            return self._drill(self.input_data, path)

        step_result = self.results.get(source)
        if step_result and step_result.output is not None:
            if path.startswith('output.'):
                sub_path = path[7:]
                if isinstance(step_result.output, dict):
                    return self._drill(step_result.output, sub_path)
                return step_result.output
            elif path == 'output':
                return step_result.output

        return value

    @staticmethod
    def _drill(data: Any, path: str) -> Any:
        """按点号路径深入取值"""
        parts = path.split('.')
        current = data
        for part in parts:
            if isinstance(current, dict):
                current = current.get(part)
            elif isinstance(current, (list, tuple)) and part.isdigit():
                idx = int(part)
                current = current[idx] if idx < len(current) else None
            else:
                return None
            if current is None:
                return None
        return current

    def _evaluate_condition(self, condition: str) -> bool:
        """简易条件评估（安全子集，仅支持比较操作）"""
        try:
            match = re.match(r'\$(\w+)\.output\.(\S+)\s*(>|<|>=|<=|==|!=)\s*(.+)', condition)
            if not match:
                return True

            step_id, field_path, op, threshold_str = match.groups()
            step_result = self.results.get(step_id)
            if not step_result or step_result.output is None:
                return False

            val = self._drill(step_result.output, field_path) if isinstance(step_result.output, dict) else None
            if val is None:
                return False

            try:
                threshold = float(threshold_str.strip())
                val = float(val)
            except (ValueError, TypeError):
                threshold = threshold_str.strip().strip('"').strip("'")
                val = str(val)

            ops = {'>': lambda a, b: a > b, '<': lambda a, b: a < b,
                   '>=': lambda a, b: a >= b, '<=': lambda a, b: a <= b,
                   '==': lambda a, b: a == b, '!=': lambda a, b: a != b}
            return ops.get(op, lambda a, b: True)(val, threshold)
        except Exception:
            return True

    @staticmethod
    def _step_to_dict(result: StepResult) -> Dict[str, Any]:
        return {
            'status': result.status,
            'output': result.output,
            'error': result.error,
            'duration_ms': result.duration_ms,
        }
