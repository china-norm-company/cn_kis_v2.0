/**
 * vis-network类型声明
 */
declare module "vis-network/standalone" {
  export interface Node {
    id: string | number;
    label?: string;
    title?: string;
    color?: string | { background?: string; border?: string };
    shape?: string;
    size?: number;
  }

  export interface Edge {
    id?: string | number;
    from: string | number;
    to: string | number;
    label?: string;
    title?: string;
    arrows?: string;
    color?: string | { color?: string };
  }

  export interface NetworkData {
    nodes: Node[];
    edges: Edge[];
  }

  export interface NetworkOptions {
    nodes?: any;
    edges?: any;
    physics?: any;
    interaction?: any;
    layout?: any;
  }

  export class Network {
    constructor(container: HTMLElement, data: NetworkData, options?: NetworkOptions);
    destroy(): void;
    setData(data: NetworkData): void;
    setOptions(options: NetworkOptions): void;
    on(event: string, callback: (params?: any) => void): void;
    off(event: string, callback: (params?: any) => void): void;
  }
}

