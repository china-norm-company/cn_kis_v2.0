# 涓嶈壇鍙嶅簲涓婃姤鍔熻兘浼樺寲

鏈洰褰曞瓨鏀俱€屽彈璇曡€呯涓嶈壇鍙嶅簲/AE 涓婃姤銆嶇浉鍏崇殑闇€姹傛⒊鐞嗐€佸樊璺濆垎鏋愪笌鍒嗛樁娈典紭鍖栨柟妗堬紝涓庡疄鐜颁唬鐮佸彉鏇村悓姝ョ淮鎶ゃ€?
---

## 1. 鑳屾櫙涓庣洰鏍?
- **鐢ㄦ埛鍦烘櫙**锛氬井淇″皬绋嬪簭鍙楄瘯鑰呭湪鐢ㄨ嵂/璇曢獙杩囩▼涓嚭鐜颁笉閫傦紝闇€蹇€熴€佸悎瑙勫湴涓婃姤 AE锛堝惈 SAE 椋庨櫓璇嗗埆锛夛紝骞惰兘鍦ㄧ鍐呮煡鐪嬪鐞嗚繘搴︺€?- **涓氬姟鐩爣**锛氶檷浣庢紡鎶ヤ笌璇姤銆佷笌 `safety.AdverseEvent` 鍙婃不鐞?閫氱煡閾捐矾瀵归綈銆佹敮鎸佸椤圭洰涓庤瘉鎹暀瀛橈紙鍥剧墖绛夛級銆?- **宸ヤ綔鍙拌竟鐣?*锛氬彈璇曡€呰嚜鍔╄兘鍔涘綊灞?**灏忕▼搴?+ `/my/*` 鎺ュ彛**锛涙繁搴﹀鎵广€侀殢璁垮綍鍏ャ€佽川閲忕鐞嗕粛浠ョ幇鏈?**瀹夊叏绠＄悊 / 娌荤悊鍙?* 鑳藉姏涓哄噯锛堝弬瑙?`backend/apps/safety/`銆乣libs/notification.py`锛夈€?
---

## 2. 鐜扮姸姊崇悊锛堜唬鐮佺储寮曪級

| 灞傜骇 | 璺緞/璇存槑 |
|------|-----------|
| 灏忕▼搴忎笂鎶ラ〉 | `apps/wechat-mini/src/pages/report/index.tsx` 鈥?鐥囩姸銆佽交涓噸搴︺€佸彂鐢熸棩鏈熴€佺収鐗?UI锛?*鐓х墖鏈殢鎻愪氦涓婁紶**锛?|
| 灏忕▼搴忚褰曞垪琛?| `apps/wechat-mini/src/pages/report/history.tsx` 鈥?`GET /my/adverse-events` |
| 鍙楄瘯鑰?API | `backend/apps/subject/api_my.py` 鈥?`POST /my/report-ae`銆乣GET /my/adverse-events`銆乣GET /my/adverse-events/{id}` |
| 棰嗗煙妯″瀷 | `backend/apps/safety/models.py` 鈥?`AdverseEvent`銆乣AESeverity`銆乣AERelation`銆乣AEStatus`銆乣AEFollowUp` |
| 鍒涘缓閫昏緫 | `backend/apps/safety/services.py` 鈥?`create_adverse_event`锛堝惈 SAE 鏃跺姞鎬?鍋忓樊/鍙樻洿绛夊垎鏀紱**灏忕▼搴忚矾寰勬湭浼?`open_id`锛岄涔﹀鎵瑰彲鑳芥湭瑙﹀彂**锛?|
| 閫氱煡 | `backend/libs/notification.py` 鈥?`notify_adverse_event` 绛?|

### 2.1 褰撳墠 `POST /my/report-ae` 琛屼负鎽樿

- 瑙ｆ瀽 `MyAEReportIn`锛歚symptom_description`銆乣severity`锛堥粯璁?`mild`锛夈€乣occur_date`锛堝彲閫夛級銆?- **鍏ョ粍**锛氫粎鍙?`Enrollment.objects.filter(subject=subject, status='enrolled').first()` 鈥?**澶氶」鐩椂鏃犳硶鎸囧畾褰掑睘椤圭洰**銆?- **鍒涘缓 AE**锛歚relation` 鍥哄畾涓?`'possible'`锛沗is_sae=(data.severity == 'severe')` 鈥?**涓村簥 SAE 瀹氫箟涓庛€岄噸搴︺€嶄笉瀹屽叏绛変环**锛岄渶浜у搧纭銆?- **鏈鐞?*锛氬墠绔凡閫夌収鐗囨湭璋冪敤涓婁紶鎺ュ彛銆佹湭鍐欏叆闄勪欢瀛楁銆?
---

## 3. 宸窛涓庨闄?
| 缂栧彿 | 闂 | 褰卞搷 |
|------|------|------|
| G1 | 鐓х墖浠呮湰鍦伴€夋嫨锛屾湭涓婁紶銆佹湭鍏宠仈 AE | 璇佹嵁閾剧己澶?|
| G2 | 澶氬叆缁勬椂榛樿 `first()` | 閿欑粦椤圭洰銆佺粺璁￠敊璇?|
| G3 | SAE 浠呯敱 `severity==severe` 鎺ㄥ | 鍙兘涓?GCP/鏂规 SAE 瀹氫箟涓嶄竴鑷?|
| G4 | `create_adverse_event` 鐨勯涔﹀鎵逛緷璧?`open_id` | 灏忕▼搴忎笂鎶ュ彲鑳?*璺宠繃**瀹℃壒鍙戣捣 |
| G5 | 鍒楄〃/璇︽儏鏈毚闇插洜鏋滃叧绯汇€佹帾鏂界瓑 | 绔唴鍙鎬т笉瓒筹紙鍙寜闃舵澧炲己锛?|
| G6 | `report_date` 涓?`DateField(auto_now_add=True)` | 浠呮棩鏈熺矑搴︼紱鑻ラ渶绮剧‘涓婃姤鏃跺埢闇€璇勪及瀛楁鎴栬ˉ鍏?|

---

## 4. 浼樺寲鏂瑰悜锛堝缓璁垎闃舵锛?
### P0 鈥?闂幆涓庢纭€?
1. **椤圭洰褰掑睘**锛氳姹備綋澧炲姞 `enrollment_id` 鎴?`protocol_id`/`project_code`锛堜笌棣栭〉 `home-dashboard` 涓€鑷达級锛屽悗绔牎楠屽睘浜庡綋鍓?`subject` 涓斾负 `enrolled`锛堟垨鎸夎鍒欏厑璁?pending锛夈€?2. **闄勪欢涓婁紶**锛氬鎺ョ幇鏈夋枃浠朵笂浼犺兘鍔涳紙涓?`API_STANDARDS`/瀛樺偍涓€鑷达級锛屾彁浜?AE 鏃朵紶 `attachment_ids` 鎴栧湪鍒涘缓鍚庡叧鑱旓紱灏忕▼搴?`chooseImage` 鈫?涓婁紶 鈫?鍐?`report-ae`銆?3. **SAE 涓庨€氱煡**锛氫骇鍝佸畾涔?SAE 鍒ゅ畾锛堝彲鍗曠嫭甯冨皵鎴栭棶鍗凤級锛沗create_adverse_event` 瀵瑰皬绋嬪簭璺緞琛ュ厖瀹℃壒/閫氱煡瑙﹀彂绛栫暐锛堝绯荤粺璐﹀彿銆佹垨鍙楄瘯鑰?open_id 鑻ュ彲寰楋級銆?
### P1 鈥?浣撻獙涓庡悎瑙勬枃妗?
1. 琛ㄥ崟澧炲姞 **涓庣爺绌朵骇鍝佺殑鍏崇郴**銆?*鏄惁鐢ㄨ嵂/鐢ㄦ硶**銆?*鏄惁灏辫瘖** 绛夛紙鎸夋柟妗堣姹傞€夊～锛夈€?2. 鍘嗗彶鍒楄〃灞曠ず **鐘舵€佷腑鏂?*銆?*涓ラ噸绋嬪害涓枃**锛涜鎯呴〉璺宠浆 `GET /my/adverse-events/{id}`锛堝綋鍓嶅垪琛ㄤ负銆屼粎鍒楄〃鏌ョ湅銆嶏級銆?3. 绱ф€ユ彁绀猴細**鍙厤缃儹绾?*锛堟潵鑷柟妗?绔欑偣閰嶇疆锛岄伩鍏嶅啓姝伙級銆?
### P2 鈥?涓庡垎鏋?璐ㄦ帶鑱斿姩

1. 涓?`visit` 娲诲姩绫诲瀷 `adverse_event`銆佸伐鍗曟墽琛屼晶涓婃姤缁熶竴缂栧彿鎴栧紩鐢ㄥ叧绯伙紙鑻ラ渶锛夈€?2. 鎶ヨ〃涓?`apps/report`銆乣quality` 妯″潡缁熻瀵归綈銆?
---

## 5. 鎺ュ彛濂戠害锛堜紭鍖栧悗寤鸿鑽夋锛?
> 瀹為檯瀛楁鍚嶄笌鏍￠獙浠ュ疄鐜版椂 `Schema` 涓哄噯锛屾澶勪负璁捐澶囧繕銆?
**`POST /api/v1/my/report-ae`锛堝閲?鍏煎锛?*

- 蹇呭～锛歚symptom_description`銆乣severity`銆乣occur_date`
- 鏂板锛堝缓璁級锛歚enrollment_id`锛堟帹鑽愶級鎴?`protocol_id`
- 鏂板锛堝缓璁級锛歚is_sae`锛堝竷灏旓紝涓?`severity` 鐙珛鏍￠獙锛?- 鏂板锛堝缓璁級锛歚attachment_ids: string[]` 鎴?`photo_urls`锛堣瀛樺偍鏂规锛?- 鍙€夛細`relation`锛堥粯璁?`possible` 鍙繚鐣欙級

**鍝嶅簲**锛氫繚鎸?`{ code, msg, data: { id, severity, status } }`锛屽彲鎵╁睍 `is_sae`銆乣feishu_approval_started` 绛変究浜庤仈璋冦€?
---

## 6. 楠屾敹瑕佺偣锛堜紭鍖栧畬鎴愬悗锛?
- [ ] 澶氬叆缁勭敤鎴峰彲閫夋嫨姝ｇ‘椤圭洰骞舵垚鍔熷垱寤?AE锛屽垪琛ㄥ綊灞炴纭€?- [ ] 甯﹀浘涓婃姤锛氬瓨鍌ㄥ彲璁块棶锛屾不鐞?瀹夊叏渚у彲鏌ョ湅锛堟潈闄愮鍚堣鑼冿級銆?- [ ] SAE 鍦烘櫙瑙﹀彂棰勬湡閫氱煡/瀹℃壒锛堜互鐜閰嶇疆涓哄噯锛屾湁鏃ュ織鍙拷韪級銆?- [ ] 涓庣幇鏈?`t_adverse_event` 杩佺Щ鍏煎锛屾棤鐮村潖宸叉湁鏁版嵁銆?- [ ] 灏忕▼搴忓急缃?澶辫触閲嶈瘯涓庢彁绀烘竻鏅般€?
---

## 7. 鏂囨。鍙樻洿璁板綍

| 鏃ユ湡 | 浣滆€?鏉ユ簮 | 璇存槑 |
|------|-----------|------|
| 2026-03-22 | 宸ョ▼澶囧繕 | 鍒濈増锛氱幇鐘剁储寮曘€佸樊璺濊〃銆佸垎闃舵寤鸿銆佹帴鍙ｈ崏妗?|

---

*鍗忎綔璇存槑锛氭湰鐩綍浣嶄簬 `docs/comprehensive_research/` 涓嬶紝榛樿鍦?`.cursorignore` 涓暣鐩綍鎺掗櫎锛涜嫢闇€鐢?Cursor Agent 鐩存帴璇诲啓锛屽彲涓?`涓嶈壇鍙嶅簲涓婃姤鍔熻兘浼樺寲/` 閰嶇疆璺緞渚嬪銆?