// Display text for model output. Flight numbers are shown as "CX 9xxx". Model sentences are English
// templates; the Chinese view translates them sentence by sentence with fixed patterns, never a language model.
import type { Status } from './types';

export type Locale = 'en' | 'zh';

export const fmtFlight = (id: string | null | undefined) => (id ? id.replace(/^CX(\d)/, 'CX $1') : '—');
const spaceFlights = (t: string) => t.replace(/\bCX(\d{1,4})\b/g, 'CX $1');

const PLACES: Record<string, { en: string; zh: string }> = {
  HKG: { en: 'Hong Kong', zh: '香港' }, PVG: { en: 'Shanghai', zh: '上海' }, NRT: { en: 'Tokyo', zh: '東京' },
  LAX: { en: 'Los Angeles', zh: '洛杉磯' }, MEL: { en: 'Melbourne', zh: '墨爾本' },
};
export const placeName = (code: string, l: Locale = 'en') => PLACES[code]?.[l] ?? code;

const COMMODITY_ZH: Record<string, string> = {
  'Consumer electronics': '消費電子產品', 'Kitchen appliances': '廚房電器', 'E commerce parcels': '電商包裹', 'Lithium batteries': '鋰電池',
  'Industrial pumps': '工業水泵', 'Medical isotopes': '醫療同位素', 'Phone components': '手機零件', 'Chilled seafood': '冰鮮海產',
  'Fashion samples': '時裝樣辦', 'Medical devices': '醫療器械', Semiconductors: '半導體', 'Toys (backlog)': '玩具（積壓）',
  'Steel fittings': '鋼配件', 'Printed matter': '印刷品', 'Fresh flowers': '鮮花', 'Car batteries': '汽車電池', 'Garment trims': '成衣輔料',
  'Bicycle parts': '單車零件', 'Machine parts': '機器零件', 'Camera lenses': '相機鏡頭', 'Game consoles': '遊戲機', 'Machine tool': '工具機',
  'Live lobster': '活龍蝦', 'Solar panels': '太陽能板', 'Sports goods': '體育用品', 'Phone cases': '手機殼', 'Spare parts': '備用零件',
  'Robot parts': '機械人零件', Accessories: '配飾', 'Board games': '桌上遊戲', 'Audio gear': '音響器材', Stationery: '文具',
  'Auto parts': '汽車零件', Catalogues: '目錄', 'Paint (DG)': '油漆（危險品）', Magazines: '雜誌', Cosmetics: '化妝品', Vaccines: '疫苗',
  Garments: '成衣', Sneakers: '波鞋', Textiles: '紡織品', Homeware: '家品', Footwear: '鞋履', Ceramics: '陶瓷', Uniforms: '制服',
  Cherries: '車厘子', Eyewear: '眼鏡', Laptops: '手提電腦', Apparel: '服裝', Orchids: '蘭花', Servers: '伺服器', Drones: '無人機',
  Snacks: '零食', Books: '書籍', Toys: '玩具', Tuna: '吞拿魚', Tea: '茶葉',
  'Bottled water': '樽裝水', 'Lithium metal cells': '鋰金屬電池', 'Paint with incomplete packaging evidence': '包裝證據不全嘅油漆',
};
export const commodityName = (name: string, l: Locale = 'en') => (l === 'zh' ? COMMODITY_ZH[name] ?? name : name);

const STATUS_ZH: Record<Status, string> = {
  'Placed automatically': '已自動安排', 'Placed, promise missed': '已安排，承諾時間延誤', 'No action needed': '毋須行動', 'Needs a person': '需要人處理',
};
export const statusName = (s: Status, l: Locale = 'en') => (l === 'zh' ? STATUS_ZH[s] : s);

const DRIVER_ZH: Record<string, string> = {
  'passenger load (bags in the belly)': '乘客量（腹艙行李）', 'hours since the airport reopened': '機場重開後時數', 'weather payload restriction': '天氣載重限制',
  'extra fuel carried': '額外燃油', 'aircraft kind': '機型', 'time of day': '起飛時段',
};
export const driverLabel = (label: string, l: Locale = 'en') => (l === 'zh' ? DRIVER_ZH[label] ?? label : label);

const RULE_ZH: Record<string, string> = {
  'dangerous goods cannot travel on a passenger aircraft': '危險品唔可以上客機',
  'departs after its latest allowed departure time': '起飛時間遲過最遲可出發時間',
  'main deck unit only fits a freighter': '主艙板只可以上貨機',
  'would exceed the allowed time in the cool room': '會超出可留喺冷藏位嘅時間',
  'different destination': '目的地唔同',
  'no temperature controlled position': '冇溫控板位',
};
/** Regulatory screen messages from model/regulatory.py, keyed without the final full stop. */
const REG_ZH: Record<string, string> = {
  'Obtain the verified dangerous-goods entry and package data': '要取得已核實嘅危險品申報同包裝資料',
  'Verify the liquid classification and package data': '要核實液體分類同包裝資料',
  'Non-dangerous liquid classification recorded in the demo': '示範紀錄顯示為非危險液體',
  "Obtain the operating carrier's applicable rules": '要取得營運航空公司嘅適用規則',
  'Resolve duplicate package-entry IDs before planning': '規劃前要處理重複嘅包裝編號',
  'Confirm the permitted remaining dry-ice capacity': '要確認航段剩餘嘅乾冰容許量',
  "This AWB alone exceeds the simulated leg's dry-ice budget": '呢張 AWB 單獨已超出模擬航段嘅乾冰上限',
  'Obtain the verified UN number and package entry ID': '要取得已核實嘅 UN 編號同包裝編號',
  'CX prohibits standalone lithium-metal batteries in the checked scope': '審查範圍內，CX 禁止單獨運送鋰金屬電池',
  'Obtain the applicable Cathay prior approval for this UN3480 shipment': '呢批 UN3480 貨要取得適用嘅事先批准',
  'Confirm the declared battery state of charge': '要確認申報嘅電池電量',
  'Charge exceeds the standard allowance. Send any applicable authority approval to a DG specialist': '電量超出標準容許範圍，要將適用嘅批准文件交危險品專員',
  'DG acceptance must verify battery condition and applicable special provisions': '危險品收貨要核實電池狀況同適用特別規定',
  'The battery entry and Class 3 material share an outer package or overpack in this checked case': '電池同第 3 類物質共用外包裝或者合裝',
  'Confirm packing group applicability and the packaging configuration': '要確認包裝類別同包裝配置',
  'Packaging evidence shows insufficient absorbent for the liquid contents': '包裝證據顯示吸收物料唔足以應付液體',
  'Verify sufficient absorbent for the full liquid contents': '要核實吸收物料足夠應付全部液體',
  'The leg acceptance record prohibits this package configuration': '航段收貨紀錄唔准呢個包裝配置',
  'Obtain a current acceptance record for this entry on the operating leg': '要取得呢個包裝喺營運航段嘅現行收貨紀錄',
  'Confirm net quantity per package and the unit in its acceptance record': '要確認每件淨量同收貨紀錄入面嘅單位',
  'Declared net quantity per package exceeds the accepted limit for this leg': '申報嘅每件淨量超出呢個航段嘅收貨上限',
  'Every eligible flight is needed for cargo that is costlier to delay': '所有可用航班都要留畀延誤代價更高嘅貨',
};
const ruleZh = (raw: string) => {
  const r = raw.trim().replace(/\.$/, '');
  const m = r.match(/^cargo cannot be ready in time \(minimum transfer ([\d.]+)h\)$/);
  if (m) return `貨物趕唔切（最短轉機 ${m[1]} 小時）`;
  const un = r.match(/^(UN\d{4}) is cargo-aircraft-only in this assessment$/);
  if (un) return `${un[1]} 喺呢次審查只可以上貨機`;
  const rec = r.match(/^Package record (\S+) matches this leg and quantity$/);
  if (rec) return `包裝紀錄 ${rec[1]} 同呢個航段同數量相符`;
  return RULE_ZH[r] ?? REG_ZH[r] ?? raw;
};
export const ruleText = (r: string, l: Locale = 'en') => (l === 'zh' ? r.split('; ').map(ruleZh).join('；') : r);

const SOURCE_ZH: Record<string, string> = {
  'IATA Lithium and Sodium Ion Battery Guidance, 2026': 'IATA 鋰及鈉離子電池指引（2026）',
  'Cathay Cargo operator variations and dangerous goods acceptance': '航空公司公開嘅營運差異同危險品收貨規定（示範，待核實）',
  'Simulated AWB/leg acceptance record': '模擬 AWB／航段收貨紀錄',
};
export const sourceText = (src: string, l: Locale = 'en') => (l === 'zh' ? SOURCE_ZH[src] ?? src : src);

const REG_STATUS: Record<string, { en: string; zh: string }> = {
  ELIGIBLE_FOR_PLANNING: { en: 'Eligible for planning', zh: '可以規劃' },
  NEEDS_DG_REVIEW: { en: 'Needs DG review', zh: '要危險品專員覆核' },
  BLOCKED: { en: 'Blocked', zh: '禁止' },
};
export const regStatusName = (st: string, l: Locale = 'en') => REG_STATUS[st]?.[l] ?? st;

const N = '(-?[\\d,]+(?:\\.\\d+)?)';
const F = '(CX\\d{1,4})';
const C = '(.+?)';
type Rule = [RegExp, (m: RegExpMatchArray) => string];
const fz = (id: string) => fmtFlight(id);
const cz = (c: string) => commodityName(c, 'zh');

const SENTENCES: Rule[] = [
  [new RegExp(`^Moved from ${F} \\(delayed ${N}h\\) to ${F}\\.$`), (m) => `由延誤 ${m[2]} 小時嘅 ${fz(m[1])} 改去 ${fz(m[3])}。`],
  [new RegExp(`^Moved from ${F} \\(on time\\) to ${F}\\.$`), (m) => `由 ${fz(m[1])} 改去 ${fz(m[2])}。`],
  [new RegExp(`^On ${F} it would miss its promise by ${N}h\\.$`), (m) => `如果留喺 ${fz(m[1])}，會延誤承諾時間 ${m[2]} 小時。`],
  [new RegExp(`^Now arrives ${N}h inside its promise\\.$`), (m) => `而家早過承諾時間 ${m[1]} 小時到達。`],
  [new RegExp(`^Now arrives ${N}h after its promise\\.$`), (m) => `而家遲過承諾時間 ${m[1]} 小時到達。`],
  [new RegExp(`^Perishable: ${N}h of shelf life left on arrival\\.$`), (m) => `易腐貨：到達時尚餘 ${m[1]} 小時保鮮期。`],
  [new RegExp(`^Moved from ${F} to ${F} to make room for cargo that is costlier to delay\\.$`), (m) => `由 ${fz(m[1])} 改去 ${fz(m[2])}，讓位畀延誤代價更高嘅貨。`],
  [new RegExp(`^Still arrives ${N}h inside its promise\\.$`), (m) => `仍然早過承諾時間 ${m[1]} 小時到達。`],
  [new RegExp(`^Still arrives ${N}h after its promise\\.$`), (m) => `會遲過承諾時間 ${m[1]} 小時到達。`],
  [new RegExp(`^${N}% chance it fits\\.$`), (m) => `${m[1]}% 機會裝得落。`],
  [/^It is low cost to bump and to delay, so it carries the risk if capacity comes in short\.$/, () => '佢被撞落機同延誤嘅代價都低，所以容量不足時由佢承擔風險。'],
  [new RegExp(`^Missed ${F} because the inbound flight is late\\.$`), (m) => `因為來程航班延誤，錯過咗 ${fz(m[1])}。`],
  [new RegExp(`^Placed on ${F}, arrives ${N}h inside its promise\\.$`), (m) => `已安排上 ${fz(m[1])}，早過承諾時間 ${m[2]} 小時到達。`],
  [new RegExp(`^Placed on ${F}, arrives ${N}h after its promise\\.$`), (m) => `已安排上 ${fz(m[1])}，遲過承諾時間 ${m[2]} 小時到達。`],
  [/^This is the earliest flight that passes every check\.$/, () => '呢班係通過所有檢查嘅最早航班。'],
  [/^The forwarder is told now, with the new arrival time\.$/, () => '而家即時通知貨代新到達時間。'],
  [new RegExp(`^Stays on ${F} as booked, arrives ${N}h inside its promise\\.$`), (m) => `按原訂留喺 ${fz(m[1])}，早過承諾時間 ${m[2]} 小時到達。`],
  [new RegExp(`^Stays on ${F} as booked, arrives ${N}h after its promise\\.$`), (m) => `按原訂留喺 ${fz(m[1])}，遲過承諾時間 ${m[2]} 小時到達。`],
  [new RegExp(`^Stays on ${F}\\.$`), (m) => `留喺 ${fz(m[1])}。`],
  [new RegExp(`^Delayed ${N}h, still arrives ${N}h inside its promise\\.$`), (m) => `延誤 ${m[1]} 小時，仍然早過承諾時間 ${m[2]} 小時到達。`],
  [new RegExp(`^On time, still arrives ${N}h inside its promise\\.$`), (m) => `準時，仍然早過承諾時間 ${m[1]} 小時到達。`],
  [/^No flight in the horizon passes every check: (.+)\.$/, (m) => `時段內冇航班通過所有檢查：${ruleText(m[1], 'zh')}。`],
  [/^Every eligible flight is needed for cargo that is costlier to delay\.$/, () => '所有可用航班都要留畀延誤代價更高嘅貨。'],
  [/^Not allowed: (.+)\.$/, (m) => `唔准：${ruleText(m[1], 'zh')}。`],
  [/^No plan satisfies every rule with this override\.$/, () => '呢個改動之下冇方案可以符合所有規則。'],
  [/^Unknown shipment or flight\.$/, () => '搵唔到呢件貨或者呢班機。'],
  [new RegExp(`^Planned to ${N}% of the median forecast\\.$`), (m) => `計劃裝載量係預測中位數嘅 ${m[1]}%。`],
  [/^Forecast is lowered most by (.+)\.$/, (m) => `預測容量主要被${m[1].split(' and ').map((p) => { const x = p.match(/^(.+) \((-?[\d,]+) kg\)$/); return x ? `${driverLabel(x[1], 'zh')}（${x[2]} kg）` : p; }).join('同')}拉低。`],
  [/^First to come off if space is short: (.+)\.$/, (m) => `如果位唔夠，最先落機：${m[1].split(', ').map(cz).join('、')}。`],
  [new RegExp(`^First leg MEL to HKG arrived T\\+${N}h on time\\.$`), (m) => `第一程墨爾本到香港 T+${m[1]}h 準時到達。`],
  [new RegExp(`^Second leg ${F} delayed ${N}h\\.$`), (m) => `第二程 ${fz(m[1])} 延誤 ${m[2]} 小時。`],
  [/^Waiting in the Hong Kong terminal since the closure\.$/, () => '機場關閉後一直喺香港貨站等候。'],
  [/^In a cool room position since the closure\.$/, () => '機場關閉後一直喺冷藏位。'],
  [new RegExp(`^Must depart by T\\+${N}h\\.$`), (m) => `必須喺 T+${m[1]}h 前出發。`],
  [new RegExp(`^Out of Shanghai on ${F}, now arriving T\\+${N}h\\.$`), (m) => `由上海經 ${fz(m[1])} 運出，而家 T+${m[2]}h 先到。`],
  [new RegExp(`^Out of Shanghai on ${F}\\.$`), (m) => `由上海經 ${fz(m[1])} 運出。`],
  [new RegExp(`^Misses ${F} at T\\+${N}h\\.$`), (m) => `趕唔切 T+${m[2]}h 嘅 ${fz(m[1])}。`],
  [new RegExp(`^Misses ${F}\\.$`), (m) => `趕唔切 ${fz(m[1])}。`],
  [new RegExp(`^Booked on ${F}\\.$`), (m) => `原訂 ${fz(m[1])}。`],
  [new RegExp(`^The ${N}h delay breaks the promise\\.$`), (m) => `延誤 ${m[1]} 小時令佢趕唔切承諾時間。`],
  [/^Short lived\.$/, () => '半衰期短。'],
  [new RegExp(`^Dangerous goods, so freighter only, and the first freighter leaves at T\\+${N}h\\.$`), (m) => `危險品只可以上貨機，而第一班貨機 T+${m[1]}h 先起飛。`],
  [/^Runway slots re sequenced after reopening\.?$/, () => '機場重開後跑道時段重新編排'],
  [new RegExp(`^Late inbound aircraft from ${F}\\.?$`), (m) => `來自 ${fz(m[1])} 嘅飛機遲到`],
  [new RegExp(`^Delayed ${N}h$`), (m) => `延誤 ${m[1]} 小時`],
  [/^On time$/, () => '準時'],
  [/^On the delayed flight to Shanghai$/, () => '延誤往上海航班上嘅貨'],
  [/^Out of Shanghai on the same aircraft$/, () => '同一架飛機由上海運出嘅貨'],
  [/^Onward connections in Hong Kong that break$/, () => '喺香港斷咗嘅接駁'],
  [new RegExp(`^Capacity on ${F} comes in ${N}% lower$`), (m) => `${fz(m[1])} 容量少 ${m[2]}%`],
  [new RegExp(`^${F} freighter is delayed ${N} more hours$`), (m) => `${fz(m[1])} 貨機再延誤 ${m[2]} 小時`],
  [new RegExp(`^${F} delay grows from ${N}h to ${N}h$`), (m) => `${fz(m[1])} 延誤由 ${m[2]} 小時增加到 ${m[3]} 小時`],
  [/^Keep the garments on the first flight$/, () => '將成衣留喺第一班機'],
  [/^Leave the cherries on the delayed flight$/, () => '將車厘子留喺延誤航班'],
  [/^Put the lithium batteries on the first flight$/, () => '將鋰電池放上第一班機'],
  [/^Send the vaccines on the later passenger flight$/, () => '將疫苗改上較後嘅客機'],
  [/^Hold the lobster for the freighter$/, () => '將活龍蝦留俾貨機'],
];
void C;

function translateSentence(s: string): string | null {
  for (const [re, fn] of SENTENCES) {
    const m = s.match(re);
    if (m) return fn(m);
  }
  return null;
}

/** Split into sentences without breaking decimals such as "3.5h". */
export function sentences(text: string): string[] {
  return text.trim().split(/(?<=\.)\s+(?=[A-Z0-9])/).map((s) => s.trim()).filter(Boolean);
}

/** Model text for display: flights spaced, and in Chinese translated sentence by sentence. Unknown sentences stay in English. */
export function modelText(text: string | null | undefined, l: Locale = 'en'): string {
  if (!text) return '';
  if (l === 'en') return spaceFlights(text);
  const whole = translateSentence(text);
  if (whole) return whole;
  return sentences(text).map((s) => translateSentence(s) ?? spaceFlights(s)).join('');
}

/** For tests: sentences that have no Chinese pattern. */
export function untranslated(text: string): string[] {
  if (!text || translateSentence(text)) return [];
  return sentences(text).filter((s) => translateSentence(s) === null);
}
