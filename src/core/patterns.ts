import { CUSTOMER_REGEX_SOURCE, findCustomerByAlias } from './customers-data';
import type { Pattern } from './types';
import { isValidTaxId, isValidTwId } from './twid';
import { ibanLength, isBirthDate, isCardNumber, isIpv6, isSsn, phoneLength } from './intl';

const CJK = '\\u4e00-\\u9fa5';

export const CITIES =
  '(?:[臺台]北市|新北市|桃園市|[臺台]中市|[臺台]南市|高雄市|基隆市|新竹[市縣]|嘉義[市縣]|苗栗縣|彰化縣|南投縣|雲林縣|屏東縣|宜蘭縣|花蓮縣|[臺台]東縣|澎湖縣|金門縣|連江縣)';
const DISTRICT = `(?:[${CJK}]{1,4}[鄉鎮市區])?`;
const ROAD = `(?:[${CJK}\\d]{1,8}(?:路|街|大道))`;
const ADDRESS_TAIL =
  `(?:[${CJK}]{1,4}[村里])?(?:\\d{1,3}鄰)?` +
  `(?:[一二三四五六七八九十\\d]{1,3}段)?(?:\\d{1,4}巷)?(?:\\d{1,4}弄)?` +
  `\\d{1,5}(?:之\\d{1,3})?號(?:[\\d一二三四五六七八九十]{1,3}樓)?(?:之\\d{1,3})?(?:[${CJK}\\d]{1,3}室)?`;

const ADDRESS_REGEX =
  `(?:${CITIES}${DISTRICT}(?:[${CJK}]{1,4}[村里])?(?:\\d{1,3}鄰)?${ROAD}?` +
  `|(?<![${CJK}])${DISTRICT}${ROAD})` +
  ADDRESS_TAIL;

/** +886 numbers: area code with or without its 0 or brackets (mobiles, +886-9, are 手機). */
const TW_LANDLINE_INTL = '\\+886[-\\x20]?\\(?0?(?:826|836|82|89|37|49|[2-8])\\)?[-\\x20]?\\d{3,4}[-\\x20]?\\d{3,4}';

const MONTH = '(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|June?|July?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)';
/**
 * A date of birth only counts right after a label saying so, on the same line (a table's next cell
 * counts, a column header above a list of dates does not); other dates are not personal data.
 */
const BIRTH_LABEL = '(?:DOB|D\\.O\\.B\\.?|[Dd]ate [Oo]f [Bb]irth|[Bb]irth ?[Dd]ate|[Bb]irthday|[Bb]orn(?: [Oo]n)?|出生日期|出生年月日|生日)';
const BIRTH_DATE =
  `(?<=${BIRTH_LABEL}[\\x20\\t]*[:：]?[\\x20\\t]*)(?:` +
  '(?:民國\\s*)?\\d{2,4}\\s*年\\s*\\d{1,2}\\s*月\\s*\\d{1,2}\\s*日?' +
  '|\\d{4}[-/.]\\d{1,2}[-/.]\\d{1,2}' +
  '|\\d{1,2}[-/.]\\d{1,2}[-/.]\\d{4}' +
  `|${MONTH}\\.?\\x20+\\d{1,2}(?:st|nd|rd|th)?,?\\x20+\\d{4}` +
  `|\\d{1,2}(?:st|nd|rd|th)?\\x20+${MONTH}\\.?,?\\x20+\\d{4})`;

/** Organisation suffixes that reliably end a company name; bare 公司 is too ambiguous (本公司, 公司電話). */
const COMPANY_SUFFIX =
  '(?:股份有限公司|有限公司|無限公司|兩合公司|' +
  '企業社|工作室|事務所|商行|診所|基金會|協會|合作社|工程行|企業行|實業社|文化事業|' +
  '集團|控股|科技公司|實業公司|工業公司|貿易公司|資訊公司|國際公司|電子公司|精密公司|' +
  '工程公司|設備公司|機器公司|機械公司|化工公司|製藥公司|生技公司|物流公司|顧問公司|' +
  '投資公司|開發公司|控股公司|服務公司|企業公司|商社|工廠)';
/** Characters that never start a company name but often precede one in prose. */
const COMPANY_NOT_FIRST = '的與和及於在由向從為對將把讓依據至到給經受同各該本貴我敝此其係即為者以並或如';
const COMPANY_REGEX = `(?:(?![${COMPANY_NOT_FIRST}])[${CJK}A-Za-z0-9&·]){2,14}?${COMPANY_SUFFIX}`;

const COMPOUND_SURNAMES = '歐陽|司馬|諸葛|上官|張簡|范姜|司徒|東方|令狐|南宮|端木|皇甫|尉遲|夏侯';
const SINGLE_SURNAMES =
  '陳林黃張李王吳劉蔡楊許鄭謝郭洪邱曾廖賴徐周葉蘇莊呂江何蕭羅高潘簡朱鍾游彭詹胡施沈余盧梁趙顏柯翁魏孫戴范方宋鄧杜傅侯曹薛丁卓阮馬董溫唐藍蔣石古紀姚連馮歐程湯田康姜白汪鄒尤巫鐘黎塗龔嚴韓袁金童陸夏柳邵錢伍倪甘秦官辛戚易祝樊喬向殷凌闕舒包鮑冉牛管毛涂';

/** Contexts that commonly follow a person's name; keeps 2-vs-3 char names from over-capturing. */
const NAME_FOLLOW =
  '(?=$|[\\s\\d\\p{P}A-Za-z]|先生|小姐|女士|同學|醫師|醫生|護理師|老師|律師|經理|主任|董事|總監|組長|課長|科長|處長|局長|部長|教授|博士|君|兄|姐|哥|等|表示|說|指出|認為|於|在|與|和|及|為|所|之|的|已|將|曾|因|向|由|係|即|亦|並|或' +
  '|另|也|則|更|未|不|有|無|是|非|對|從|自|以|被|經|卻|還|又|再|但|而|才|都|皆|均|便|就|會|能|可|應|須|要|想|願|正|到|來|去|至|提|收|付|持|稱|同意|聲明|陳述|申請|提供|前往|出席|簽|辦理|負責|擔任|購買|支付|領取|遞交|回覆|聯絡|通知|告知)';

/** Characters that essentially never appear inside a given name; used by both branches below. */
const NAME_STOP_CHARS =
  '的了是在有和與及於為等所之已將因向由係即亦並或另也則未不無非對從自以被經卻還又再但而才都皆均便就會能可應須要想願到來去至收付持稱接提說表指認出簽辦負擔購支領遞回聯通告這那該此其每各們呢嗎吧啊麼什怎很太最曾先女請讓使給把令當若個' +
  '除獲可得中後前內外上下左右人者員方師商廠處室部課科組會局署院所館店行社站場區市縣鄉鎮村里路街段巷弄號樓書表單函件案費金款稅價率度量數期日月年時分秒次項條目節章頁式法制權力性化業物料器具機車櫃箱盒盤架報絡連';

/**
 * Branch 1: 1–2 name chars (excluding stop chars) followed by a known context word (precise for 2-vs-3 char names).
 * Branch 2: exactly 2 name chars that are not function/stop words (recall when the next word is unknown).
 */
const NAME_REGEX =
  `(?:${COMPOUND_SURNAMES}|[${SINGLE_SURNAMES}])` +
  `(?:(?:(?![${NAME_STOP_CHARS}])[${CJK}]){1,2}${NAME_FOLLOW}|(?:(?![${NAME_STOP_CHARS}])[${CJK}]){2})`;

/** Common words that start with a surname character but are not names. */
const NAME_STOPLIST = new Set([
  '王國', '王子', '王牌', '李子', '張開', '張貼', '張力', '陳述', '陳列', '陳舊', '林口', '林業', '林地',
  '高雄', '高速', '高中', '高級', '高度', '高溫', '高血', '黃金', '黃色', '黃昏', '吳郭', '何時', '何況',
  '何人', '何處', '何等', '何種', '何者', '何以', '何不', '何在', '何其', '何去',
  '何謂', '馬上', '馬路', '周年', '周末', '周邊', '周圍', '方法', '方面', '方向', '方式', '方案', '許多',
  '許可', '江山', '江湖', '白色', '白天', '白血', '黑色', '金門', '金額', '金融', '金屬', '金錢', '長期',
  '文件', '文化', '石頭', '程式', '程度', '康復', '常見', '章節', '施工', '施行', '萬一', '羅列', '夏天',
  '夏季', '史上', '田地', '余額', '毛病', '任何', '任務', '古代', '古蹟', '紀錄', '紀念', '連結', '連續',
  '連接', '連線', '溫度', '溫暖', '唐朝', '藍色', '石油', '康健', '姜母', '白天', '汪洋', '童年', '陸地',
  '柳樹', '錢包', '甘心', '秦朝', '官方', '官員', '易於', '祝福', '喬木', '向來', '凌晨', '舒服', '包含',
  '包括', '包裝', '鮑魚', '牛肉', '牛奶', '管理', '毛巾', '柯南', '翁婿', '魏晉', '孫子', '戴上', '范圍',
  '宋朝', '杜絕', '侯爵', '曹操', '丁點', '卓越', '馬克', '董事', '藍圖', '蔣公', '石膏', '鄧小', '傅立',
  '梁柱', '趙錢', '顏色', '簡單', '簡介', '簡稱', '簡報', '簡章', '簡表', '簡歷', '簡要', '簡化', '簡潔',
  '簡述', '簡析', '簡明', '簡略', '簡直', '朱紅', '鍾情', '游泳', '游戲', '詹姆', '胡說', '胡椒',
  '沈默', '盧比', '呂宋', '江西', '何必', '蕭條', '羅馬', '羅列', '高雄', '潘朵', '莊園', '蘇打', '葉子',
  '徐徐', '廖化', '賴床', '曾經', '洪水', '郭台', '謝謝', '鄭重', '許願', '蔡英', '劉海', '吳哥', '楊桃',
  '張三', '李四', '王五', '謝絕', '謝意', '許久', '賴以', '曾任', '曾獲', '曾得', '曾有', '曾為', '曾於',
  '曾在', '曾被', '曾由', '曾向', '曾與', '曾因', '曾是', '洪流', '邱比', '徐步', '廖若', '莊嚴',
  '管轄', '管制', '管線', '管道', '管控', '溫濕', '溫馨', '溫室', '何疑', '易雙', '謝您', '謝函', '謝禮', '高層', '高額',
  '方為', '方除', '牛市', '包商', '向下', '向上', '任一', '安全', '安裝', '安排',
  '程師', '程中', '程序', // 工程師、過程中、程序
  '簡訊', '向本', // 手機簡訊、向本會／本公司申請
  '高強', '高品', '高階', '高低', '高達', '高壓', '高抗',
  '易港', '易交', '港區', '交期', '強度', '條款', '連絡', '聯絡',
]);

/** "X方" in contracts/legal text (甲方、乙方、雙方、他方、違反方…) is a party, not a person surnamed 方. */
const PARTY_PREFIX = /[甲乙丙丁雙各買賣我他貴對本該多官軍校院廠資勞前後男女一二三四五六七八九十任另每反]$/u;

function isPlausibleName(m: string, before = ''): boolean {
  if (NAME_STOPLIST.has(m.slice(0, 2))) return false;
  if (m.length >= 3 && NAME_STOPLIST.has(m.slice(1, 3))) return false;
  if (/(.)\1/.test(m) && m.length === 2) return false;
  if (m.startsWith('方') && PARTY_PREFIX.test(before)) return false;
  if (m.startsWith('何') && /[任如為幾若奈無]$/u.test(before)) return false; // 任何、如何、幾何…
  if (m.startsWith('易') && /[貿簡變平通輕交易]$/u.test(before)) return false; // 貿易港區、交易交期…
  if (m.startsWith('金') && /[訂定押獎薪佣酬基保現稅租資金定退補款本母美黃白黑]$/u.test(before)) return false; // 訂金後、租金等…
  if (m.startsWith('程') && /[過流課章排時工議規遠前途旅學療]$/u.test(before)) return false; // 過程中、流程、工程…
  if (m.startsWith('連') && /[合約毗接相牽勾串一]$/u.test(before)) return false; // 一連、相連…
  return true;
}

/** Customer Context Labels in enterprise business docs / POs / Quotations / Invoices. */
const CUSTOMER_LABEL =
  '(?:客戶(?:名稱|全名|簡稱|抬頭|公司)?' +
  '|買受人(?:全名|名稱|抬頭|公司)?' +
  '|買受客戶|買受單位' +
  '|買方(?:全名|名稱|客戶|公司)?' +
  '|終端(?:專案)?客戶|專案客戶|合作客戶|合作採購單位|合作單位' +
  '|採購單位|採購客戶|採購商|採購方' +
  '|訂購人|訂購單位|訂購客戶|訂購廠商' +
  '|委託人|委託單位|委託客戶|往來客戶|合約客戶|收貨人|受貨人|發票抬頭' +
  '|[Cc]ustomer(?:\\s*(?:[Nn]ame|[Aa]ccount))?' +
  '|[Cc]lient(?:\\s*[Nn]ame)?|[Bb]uyer(?:\\s*[Nn]ame)?|[Pp]urchaser(?:\\s*[Nn]ame)?' +
  '|[Ss]old\\s*[Tt]o|[Bb]ill\\s*[Tt]o|[Ss]hip\\s*[Tt]o|[Cc]onsignee|[Aa]ccount\\s*[Nn]ame)';

const CONTEXTUAL_CUSTOMER_REGEX =
  `(?:` +
  `(?<=${CUSTOMER_LABEL}[\\x20\\t]*[:：][\\x20\\t]*)` +
  `[${CJK}A-Za-z0-9&·][${CJK}A-Za-z0-9&·.,'\\-\\x20]{1,59}?(?=[\\r\\n，;；()（）\\[\\]【】{}|]|\\x20+[(（]|$)` +
  `|` +
  `(?<=\\bAccount[\\x20\\t]*:[\\x20\\t]*[A-Z0-9&+\\-]{2,12}[\\x20\\t]+)[^\\r\\n]+?(?=[\\x20\\t]+Date\\x20+Last\\x20+Tran\\b|[\\r\\n]|$)` +
  `)`;

const INTL_COMPANY_LEGAL =
  '(?:Inc\\.?|INC\\.?|Incorporated|INCORPORATED|LLC|L\\.L\\.C\\.|Ltd\\.?|LTD\\.?|Limited|LIMITED|Corp\\.?|CORP\\.?|Corporation|CORPORATION|Co\\.,?\\s*Ltd\\.?|Co\\.,?\\s*LTD\\.?|Co\\.|GmbH|AG|S\\.p\\.A\\.?|B\\.V\\.?|BV|S\\.A\\.?|Pty\\.?\\s*Ltd\\.?|Pte\\.?\\s*Ltd\\.?|SDN\\.?\\s*BHD\\.?|SE|Plc|PLC|LLP|LP)';

const INTL_COMPANY_SUFFIX =
  `(?:(?:Group|GROUP|Holdings?|HOLDINGS?|Enterprises?|Industries?|Technologies?|Solutions?|Systems?)(?:,?\\x20*${INTL_COMPANY_LEGAL})?|${INTL_COMPANY_LEGAL})(?:\\x20+${INTL_COMPANY_LEGAL})?(?:\\x20+\\([A-Za-z0-9&.,'\\-\\x20]{1,25}\\)(?:\\x20+${INTL_COMPANY_LEGAL})?)?`;

const INTL_COMPANY_REGEX =
  `(?<![A-Za-z])(?!Page\\x20+\\d)(?!Account\\b)(?<!Account[\\x20\\t]*:[\\x20\\t]*[A-Z0-9&+\\-]*)` +
  `(?:` +
  `[A-Z](?:(?![0-9][A-Z][a-z])[A-Za-z0-9&·()/,+'\\-\\x20.]){1,55}?\\b${INTL_COMPANY_SUFFIX}(?![A-Za-z0-9])` +
  `|` +
  `[A-Z][A-Za-z0-9.'\\-]{1,20}(?:\\x20+[A-Z][A-Za-z0-9.'\\-]{1,20})*\\x20+(?:&|and)\\x20+[A-Z][A-Za-z0-9.'\\-]{1,20}(?:\\x20+(?:Decker|Holdings?|Group|Enterprises?|Solutions?|Systems?|Technologies?|Tools?|Industries?|Trading|Services?|International|Factors?|Spares?|Supplies|Commercials?|Repairs?))?` +
  `)`;

const EN_HONORIFIC = '(?:(?:Mr|Mrs|Ms|Miss|Dr|Prof)\\.?[\\x20\\t]+)';
const EN_TITLE_WORD = "(?:(?:Mc|Mac|O')[A-Z][a-z]{1,14}|[A-Z]{1,2}[a-z]{1,16}(?:-[A-Z][a-z]{1,16})?)";
const EN_MIDDLE_PART = "(?:[\\x20\\t]+(?:[A-Z]\\.?|'[A-Za-z]{2,12}'|\\/[\\x20\\t]*[A-Z][a-z]{1,15}|(?:Le|La|De|Van|Von|[A-Z][a-z]{1,15})))";

const EN_NAME_REGEX =
  '(?:' +
  `(?<![A-Za-z0-9])(?:${EN_HONORIFIC}[A-Za-z][a-z]{1,16}${EN_MIDDLE_PART}{0,2}[\\x20\\t]+${EN_TITLE_WORD}|${EN_TITLE_WORD}${EN_MIDDLE_PART}{0,2}[\\x20\\t]+${EN_TITLE_WORD})(?![A-Za-z0-9])` +
  '|' +
  `(?<=Totals\\x20+for\\x20+account[\\x20\\t]*:[\\x20\\t]*[A-Z0-9&+\\-]{2,12}[\\r\\n]+)(?:${EN_HONORIFIC})?[A-Za-z][A-Za-z.'\\-\\x20/]{1,35}?(?=\\x20+(?:\\(?a\\/cs\\)?|Accts|44\\x20|353\\x20|0\\d|\\d+\\.\\d+|-\\d+\\.\\d+)|[\\r\\n]|$)` +
  ')';

/** Common English first names (given names) to prevent matching arbitrary Title-Case business phrases (e.g. Sales Ledger, Aged Debtors). */
const EN_GIVEN_NAMES = new Set([
  'aaron', 'abigail', 'adam', 'adrian', 'aidan', 'alan', 'albert', 'alec', 'alex', 'alexander',
  'alexandra', 'alexis', 'alfred', 'alice', 'alicia', 'alison', 'allan', 'allen', 'allison', 'alyssa',
  'amanda', 'amber', 'amelia', 'amy', 'andrea', 'andrew', 'andy', 'angel', 'angela', 'angie',
  'anita', 'ann', 'anna', 'anne', 'annette', 'annie', 'anthony', 'antonio', 'april', 'archie',
  'ariel', 'arnold', 'arthur', 'ashley', 'audrey', 'austin', 'ava', 'barbara', 'barry', 'beatrice',
  'becky', 'belinda', 'ben', 'benjamin', 'bernard', 'bernice', 'bertha', 'bessie', 'beth', 'betty',
  'beverly', 'bill', 'billy', 'blake', 'bob', 'bobby', 'bonnie', 'brad', 'bradley', 'brandon',
  'brenda', 'brent', 'brett', 'brian', 'brianna', 'brid', 'bridget', 'brittany', 'brooke', 'bruce', 'bryan',
  'bryce', 'byron', 'caleb', 'callum', 'calvin', 'cameron', 'camilla', 'candice', 'carl', 'carla',
  'carlos', 'carmen', 'carol', 'carole', 'caroline', 'carolyn', 'carrie', 'carter', 'casey', 'cassandra',
  'catherine', 'cathy', 'cecil', 'cecilia', 'cedric', 'celia', 'chad', 'charleen', 'charles', 'charlie', 'charlotte',
  'chas', 'chase', 'chelsea', 'cheryl', 'chester', 'chloe', 'chris', 'christian', 'christina', 'christine', 'christopher',
  'cindy', 'claire', 'clara', 'clarence', 'clark', 'claude', 'claudia', 'claudio', 'clayton', 'cliff', 'clifford',
  'clint', 'clinton', 'clive', 'clyde', 'cody', 'colin', 'colleen', 'connie', 'connor', 'constance',
  'corey', 'corinne', 'cory', 'courtney', 'craig', 'crystal', 'curtis', 'cynthia', 'cyril', 'dafydd', 'daisy',
  'dale', 'dallas', 'damian', 'damien', 'damon', 'dan', 'dana', 'daniel', 'danielle', 'danny', 'daphne',
  'darlene', 'darrell', 'darren', 'darryl', 'daryl', 'dave', 'david', 'dawn', 'dean', 'debbie', 'deborah',
  'debra', 'declan', 'deirdre', 'delia', 'denis', 'denise', 'dennis', 'derek', 'derrick', 'desmond',
  'devin', 'devon', 'diana', 'diane', 'dianne', 'dick', 'diego', 'dillon', 'dolores', 'dominic',
  'don', 'donald', 'donna', 'donovan', 'dora', 'doreen', 'doris', 'dorothy', 'doug', 'douglas',
  'drew', 'duane', 'duncan', 'dustin', 'wayne', 'dwight', 'dylan', 'earl', 'ed', 'eddie',
  'edgar', 'edith', 'edmond', 'edmund', 'edna', 'eduardo', 'edward', 'edwin', 'eileen', 'elaine',
  'eleanor', 'elena', 'eli', 'elijah', 'elisa', 'elisabeth', 'elise', 'eliza', 'elizabeth', 'ella',
  'ellen', 'elliot', 'elliott', 'ellis', 'elmer', 'eloise', 'elsa', 'elsie', 'elvin', 'elvis',
  'emanuel', 'emerson', 'emil', 'emily', 'emma', 'emmanuel', 'enid', 'eric', 'erica', 'erick', 'erik',
  'erika', 'erin', 'ernest', 'ernie', 'errol', 'estelle', 'esther', 'ethan', 'ethel', 'eugene',
  'eunice', 'eva', 'evan', 'evelyn', 'everett', 'faith', 'faye', 'felicia', 'felix', 'fernando',
  'fiona', 'florence', 'floyd', 'frances', 'francis', 'francisco', 'frank', 'frankie', 'franklin', 'fred',
  'freda', 'freddie', 'frederick', 'frida', 'gabriel', 'gabrielle', 'gail', 'gareth', 'garrett', 'garry', 'garth', 'gary',
  'gavin', 'gayle', 'gemma', 'gene', 'genevieve', 'geoff', 'geoffrey', 'george', 'georgia', 'georgina',
  'gerald', 'geraldine', 'gerard', 'gerry', 'gertrude', 'gilbert', 'giles', 'gill', 'gillian', 'gina',
  'ginger', 'gloria', 'glenn', 'glyn', 'gordon', 'grace', 'graeme', 'graham', 'granville', 'grant', 'greg',
  'gregg', 'gregory', 'greta', 'gretchen', 'gus', 'guy', 'gwen', 'gwendolyn', 'hailey', 'haley', 'hamish',
  'hank', 'hanna', 'hannah', 'hans', 'harold', 'harriet', 'harrison', 'harry', 'harvey', 'hayden',
  'hayley', 'hazel', 'heath', 'heather', 'hector', 'heidi', 'helen', 'helena', 'helene', 'henri',
  'henry', 'herbert', 'herman', 'hilary', 'hilda', 'holly', 'homer', 'hope', 'horace', 'howard',
  'hubert', 'ugh', 'hugh', 'hugo', 'hunter', 'iain', 'ian', 'ida', 'ignacio', 'igor', 'ilona',
  'imogen', 'inez', 'ingrid', 'ioan', 'irene', 'iris', 'irma', 'irving', 'irwin', 'isaac', 'isabel',
  'isabella', 'isabelle', 'isaiah', 'isobel', 'ivan', 'ivy', 'jack', 'jackie', 'jackson', 'jacob', 'jacqueline',
  'jacqui', 'jade', 'jake', 'james', 'jamie', 'jan', 'jane', 'janet', 'janice', 'janine',
  'jared', 'jasmine', 'jason', 'jasper', 'javier', 'jay', 'jayden', 'jean', 'jeanette', 'jeanne',
  'jeannette', 'jeff', 'jeffery', 'jeffrey', 'jen', 'jenna', 'jennifer', 'jenny', 'jeremy', 'jerome',
  'jerry', 'jesse', 'jessica', 'jessie', 'jill', 'jillian', 'jim', 'jimmie', 'jimmy', 'jo',
  'joan', 'joann', 'joanna', 'joanne', 'jocelyn', 'jodi', 'jodie', 'jody', 'joe', 'joel',
  'joey', 'johan', 'johann', 'johanna', 'john', 'johnathan', 'johnnie', 'johnny', 'jolene', 'jon', 'jonah',
  'jonathan', 'jonathon', 'jordan', 'jorge', 'jose', 'josef', 'joseph', 'josephine', 'josh', 'joshua',
  'josie', 'joy', 'joyce', 'juan', 'juanita', 'judith', 'judy', 'jules', 'julia', 'julian',
  'juliana', 'julie', 'juliet', 'juliette', 'julio', 'julius', 'june', 'justin', 'justine', 'kaitlyn',
  'karen', 'karin', 'karina', 'karl', 'karla', 'kate', 'katelyn', 'katherine', 'kathleen', 'kathryn',
  'kathy', 'katie', 'katrina', 'kay', 'kayla', 'kayleigh', 'keith', 'kelly', 'kelsey', 'kelvin',
  'ken', 'kendall', 'kendra', 'kenneth', 'kenny', 'kent', 'kerry', 'kevin', 'kim', 'kimberly',
  'kirk', 'kirsten', 'kirsty', 'kit', 'kitty', 'klaus', 'krista', 'kristen', 'kristi', 'kristin',
  'kristina', 'kristine', 'kristopher', 'kristy', 'kurt', 'kyle', 'kylie', 'lacey', 'lana', 'lance',
  'lara', 'larry', 'laura', 'lauren', 'laurence', 'laurie', 'lawrence', 'lea', 'leah', 'leanne',
  'lee', 'leigh', 'leila', 'leland', 'lena', 'lenny', 'leo', 'leon', 'leona', 'leonard',
  'leonie', 'leroy', 'les', 'lesley', 'leslie', 'lester', 'leticia', 'lewis', 'liam', 'lillian',
  'lillie', 'lilly', 'lily', 'linda', 'lindsay', 'lindsey', 'lionel', 'lisa', 'liz', 'liza',
  'lizzie', 'lloyd', 'logan', 'lois', 'lola', 'lonnie', 'lora', 'loraine', 'loren', 'lorena', 'lorenzo',
  'loretta', 'lori', 'lorna', 'lorraine', 'lou', 'louis', 'louisa', 'louise', 'lowell', 'lucas',
  'lucia', 'lucille', 'lucinda', 'lucy', 'luis', 'luke', 'luther', 'lydia', 'lyle', 'lynda',
  'lyndsey', 'lynette', 'lynn', 'lynne', 'mabel', 'mackenzie', 'maddie', 'madeleine', 'madeline', 'madison', 'mae',
  'maggie', 'malcolm', 'mallory', 'mandy', 'manuel', 'marc', 'marcel', 'marcia', 'marco', 'marcos',
  'marcus', 'margaret', 'margarita', 'margery', 'margie', 'margo', 'marguerite', 'maria', 'marian', 'marianne',
  'marie', 'marilyn', 'marina', 'mario', 'marion', 'marisa', 'marissa', 'marjorie', 'mark', 'marlene',
  'marlon', 'marsha', 'marshall', 'marta', 'martha', 'martin', 'martina', 'marty', 'martyn', 'marvin', 'mary',
  'mason', 'mathew', 'matilda', 'matt', 'matthew', 'maureen', 'maurice', 'mavis', 'max', 'maxine',
  'may', 'maya', 'mazher', 'megan', 'meghan', 'mel', 'melanie', 'melinda', 'melissa', 'melody', 'melvin',
  'mercedes', 'meredith', 'merle', 'mervyn', 'mia', 'micaela', 'micah', 'michael', 'michaela', 'micheal',
  'michel', 'michela', 'michele', 'michelle', 'mick', 'mickey', 'miguel', 'mike', 'mildred', 'miles', 'millie',
  'milton', 'mindy', 'minnie', 'miranda', 'miriam', 'misty', 'mitch', 'mitchell', 'moira', 'molly',
  'mona', 'monica', 'monika', 'monique', 'monte', 'monty', 'morgan', 'morris', 'morton', 'muriel',
  'murray', 'myles', 'myra', 'myrna', 'myron', 'myrtle', 'nadia', 'nadine', 'nan', 'nancy',
  'naomi', 'natalia', 'natalie', 'natasha', 'nathan', 'nathaniel', 'neal', 'ned', 'neil', 'neill', 'nell',
  'nellie', 'nelson', 'neville', 'nicholas', 'nick', 'nicky', 'nicola', 'nicole', 'nigel', 'nikki',
  'nina', 'noah', 'noel', 'nola', 'nolan', 'nora', 'norah', 'norma', 'norman', 'olga',
  'olive', 'oliver', 'olivia', 'ollie', 'omar', 'opal', 'ophelia', 'orlando', 'oscar', 'otis',
  'otto', 'owen', 'paige', 'pam', 'pamela', 'pat', 'patricia', 'patrick', 'patsy', 'patti',
  'patty', 'paul', 'paula', 'paulette', 'pauline', 'pearl', 'pedro', 'peggy', 'penelope', 'penny',
  'percy', 'perry', 'pete', 'peter', 'peyton', 'phil', 'philip', 'phillip', 'phoebe', 'phyllis',
  'pierre', 'pippa', 'polly', 'poppy', 'preston', 'priscilla', 'quentin', 'quinn', 'rachael', 'rachel',
  'rafael', 'ralph', 'ramon', 'ramona', 'randall', 'randolph', 'randy', 'raphael', 'raquel', 'raul',
  'ray', 'raymond', 'rebecca', 'rebekah', 'reed', 'reg', 'reggie', 'regina', 'reginald', 'rene',
  'renee', 'reuben', 'rex', 'rhonda', 'ricardo', 'rich', 'richard', 'rick', 'rickey', 'ricky',
  'riley', 'rita', 'rob', 'robbie', 'robert', 'roberta', 'roberto', 'robin', 'robyn', 'rocco',
  'rochelle', 'rod', 'roderick', 'rodger', 'rodney', 'rodrigo', 'roger', 'roland', 'rolf', 'roman',
  'ron', 'ronald', 'ronnie', 'rory', 'rosa', 'rosalie', 'rosalind', 'rosalyn', 'rose', 'rosemary',
  'rosie', 'ross', 'rowan', 'roxanne', 'roy', 'royce', 'ruben', 'ruby', 'rudolph', 'rudy',
  'rupert', 'russ', 'russell', 'ruth', 'ryan', 'sabrina', 'sadie', 'sally', 'sam', 'samantha',
  'sammy', 'samuel', 'sandra', 'sandy', 'santiago', 'sara', 'sarah', 'sasha', 'saul', 'savannah',
  'scott', 'sean', 'sebastian', 'selena', 'selina', 'serena', 'sergio', 'seth', 'shane', 'shannon',
  'shari', 'sharon', 'shaun', 'shauna', 'shawn', 'shawna', 'sheena', 'sheila', 'shelby', 'sheldon', 'shelley',
  'shelly', 'sheri', 'sherri', 'sherry', 'sheryl', 'shirley', 'sid', 'sidney', 'sienna', 'sierra',
  'silvia', 'simeon', 'simi', 'simon', 'simone', 'sinclair', 'siobhan', 'sofia', 'solomon', 'sonia', 'sonja',
  'sonya', 'sophia', 'sophie', 'spencer', 'stacey', 'staci', 'stacie', 'stacy', 'stan', 'stanley',
  'stefan', 'stefanie', 'stella', 'stephan', 'stephanie', 'stephen', 'sterling', 'steve', 'steven', 'stewart',
  'stuart', 'sue', 'summer', 'susan', 'susanna', 'susannah', 'susanne', 'susie', 'suzanne', 'suzie',
  'swally', 'sybil', 'sydney', 'sylvester', 'sylvia', 'tabitha', 'tamara', 'tami', 'tammy', 'tamo', 'tania', 'tanya',
  'tara', 'tasha', 'taylor', 'ted', 'teddy', 'terence', 'teresa', 'teri', 'terrance', 'terrell',
  'terrence', 'terri', 'terry', 'tess', 'tessa', 'thelma', 'theo', 'theodore', 'theresa', 'therese',
  'thomas', 'tia', 'tiffany', 'tim', 'timmy', 'timothy', 'tina', 'tobias', 'toby', 'todd',
  'tom', 'tommie', 'tommy', 'toni', 'tonia', 'tony', 'tonya', 'tracey', 'traci', 'tracie',
  'tracy', 'travis', 'trent', 'trevor', 'tricia', 'trina', 'trisha', 'tristan', 'troy', 'trudy',
  'tyler', 'tyrone', 'ulrich', 'ursula', 'val', 'valerie', 'van', 'vanessa', 'vaughn', 'velma',
  'vera', 'vernon', 'veronica', 'vic', 'vicki', 'vickie', 'vicky', 'victor', 'victoria', 'vimal', 'vince',
  'vincent', 'viola', 'violet', 'virginia', 'vivian', 'vivienne', 'vladimir', 'wade', 'wallace', 'wally',
  'walt', 'walter', 'wanda', 'wanli', 'warren', 'warwick', 'wendell', 'wendy', 'werner', 'wes', 'wesley',
  'whitney', 'wilbur', 'wilfred', 'will', 'willard', 'william', 'willie', 'willis', 'wilma', 'wilson',
  'winifred', 'winston', 'wm', 'woodrow', 'wyatt', 'xavier', 'yasmin', 'yolanda', 'yvonne', 'zach',
  'zachary', 'zack', 'zoe', 'zoey',
]);

/** Common Romanized Chinese / Taiwanese / East Asian surnames so e.g. "Yi-Chun Lin" or "Wei-ting Chen" or "Elliott Chang" are recognized. */
const EN_ROMANIZED_SURNAMES = new Set([
  'chang', 'chen', 'lin', 'huang', 'lee', 'wang', 'wu', 'liu', 'tsai', 'yang',
  'hsu', 'cheng', 'hsieh', 'kuo', 'hung', 'chiu', 'tseng', 'liao', 'lai', 'chou',
  'yeh', 'su', 'chuang', 'lu', 'chiang', 'ho', 'hsiao', 'lo', 'kao', 'pan',
  'chien', 'chu', 'chung', 'yu', 'peng', 'chao', 'shen', 'shih', 'hu', 'liang',
  'yen', 'ko', 'weng', 'wei', 'sun', 'tai', 'fan', 'fang', 'sung', 'teng',
  'tu', 'fu', 'hou', 'tsao', 'hsueh', 'ting', 'cho', 'ma', 'tung', 'wen',
  'tang', 'lan', 'ku', 'chi', 'yao', 'lien', 'feng', 'ou', 'tien', 'kang',
  'pai', 'wang', 'tsou', 'yu', 'wu', 'li', 'tu', 'kung', 'yen', 'han',
  'yuan', 'chin', 'tung', 'lu', 'hsia', 'liu', 'shao', 'chien', 'ni', 'kan',
  'chin', 'kuan', 'hsin', 'chi', 'yi', 'chu', 'fan', 'chiao', 'hsiang', 'yin',
  'ling', 'chueh', 'shu', 'pao', 'jan', 'niu', 'kuan', 'mao', 'kim', 'park',
  'choi', 'jung', 'kang', 'cho', 'yoon', 'jang', 'lim', 'shin', 'oh', 'seo',
  'kwon', 'hwang', 'ahn', 'song', '전', 'hong', '유', 'ko', 'moon', 'yang',
  'son', 'bae', 'baek', 'heo', 'nam', 'sim', 'noh', 'ha', 'guo', 'zhao',
  'qian', 'zhou', 'zheng', 'feng', 'zhu', 'qin', 'you', 'xu', 'he', 'shi',
  'zhang', 'kong', 'cao', 'yan', 'hua', 'jin', 'tao', 'jiang', 'qi', 'xie',
  'zou', 'yu', 'bai', 'shui', 'dou', 'zhang', 'yun', 'su', 'pan', 'ge',
  'xi', 'fan', 'peng', 'lang', 'lu', 'wei', 'chang', 'ma', 'miao', '凤',
  'fang', 'yu', 'ren', 'yuan', 'liu', 'bao', 'shi', 'tang', 'fei', 'lian',
  'cen', 'xue', 'lei', 'he', 'ni', 'tang', 'teng', 'yin', 'luo', 'bi',
  'hao', 'wu', 'an', 'chang', 'le', 'yu', 'shi', 'fu', 'pi', 'bian',
  'qi', 'kang', 'wu', 'yu', 'yuan', 'bu', 'gu', 'meng', 'ping', 'huang',
  'he', 'mu', 'xiao', 'yin', 'yao', 'shao', 'zhan', 'wang', 'qi', 'mao',
  'yu', 'di', 'mi', 'bei', 'ming', 'zang', 'ji', 'fu', 'cheng', 'dai',
  'tan', 'song', 'mao', 'pang', 'xiong', 'ji', 'shu', 'qu', 'xiang', 'zhu',
  'dong', 'liang', 'du', 'ruan', 'lan', 'min', 'xi', 'ji', 'ma', 'qiang',
  'jia', 'lu', 'lou', 'wei', 'jiang', 'tong', 'yan', 'guo', 'mei', 'sheng',
  'lin', 'diao', 'zhong', 'xu', 'qiu', 'luo', 'gao', 'xia', 'cai', 'tian',
  'fan', 'hu', 'ling', 'huo', 'yu', 'wan', 'zhi', 'ke', 'zan', 'guan',
  'lu', 'mo', 'jing', 'fang', 'qiu', 'miao', 'gan', 'xie', 'ying', 'zong',
  'ding', 'xuan', 'ben', 'deng', 'yu', 'shan', 'hang', 'hong', 'bao', 'zhu',
  'zuo', 'shi', 'cui', 'ji', 'niu', 'gong', 'cheng',
]);

/** Business, accounting, industrial, and company words that are NEVER part of a person's name. */
const EN_NON_NAME_WORDS = new Set([
  // Accounting & Ledger headers (e.g. Sales Ledger, Aged Debtors, Age Against, Tran Type, Days From, Credit Note, Goods In)
  'sales', 'ledger', 'aged', 'debtors', 'debtor', 'creditors', 'creditor', 'age', 'against',
  'tran', 'trans', 'transaction', 'transactions', 'type', 'types', 'days', 'from', 'credit', 'debit',
  'note', 'notes', 'invoice', 'invoices', 'account', 'accounts', 'balance', 'balances', 'total', 'totals',
  'subtotal', 'amount', 'amounts', 'report', 'reports', 'detailed', 'summary', 'retrospective', 'period',
  'date', 'dates', 'time', 'due', 'overdue', 'current', 'future', 'base', 'terms', 'conditions',
  'month', 'months', 'year', 'years', 'weekly', 'monthly', 'annual', 'pages',
  'purchase', 'order', 'orders', 'payment', 'payments', 'receipt', 'receipts', 'statement', 'statements',
  'tax', 'vat', 'currency', 'sterling', 'dollar', 'dollars', 'euro', 'pound', 'pounds', 'net', 'gross',
  'discount', 'interest', 'charge', 'charges', 'fee', 'fees', 'cost', 'costs', 'prices',
  'budget', 'forecast', 'audit', 'fiscal', 'financial', 'finance', 'accounting', 'bookkeeping',
  // General business / UI / support terms
  'customer', 'customers', 'client', 'clients', 'buyer', 'buyers', 'purchaser', 'vendor', 'vendors',
  'supplier', 'suppliers', 'partner', 'partners', 'member', 'members', 'user', 'users', 'admin',
  'support', 'desk', 'help', 'service', 'services', 'care', 'center', 'centre', 'system', 'systems',
  'solution', 'solutions', 'network', 'networks', 'access', 'log', 'logs', 'router', 'server', 'cloud',
  'data', 'database', 'record', 'records', 'file', 'files', 'document', 'documents', 'form', 'forms',
  'list', 'packing', 'shipping', 'billing', 'delivery', 'freight', 'cargo',
  'express', 'logistics', 'transport', 'transportation', 'warehouse', 'storage', 'distribution',
  'contact', 'phone', 'telephone', 'mobile', 'fax', 'email', 'address', 'street', 'road', 'avenue',
  'industrial', 'estate', 'zone', 'district',
  'city', 'town', 'county', 'state', 'province', 'country', 'united', 'kingdom', 'states', 'republic',
  'central', 'midland', 'midlands', 'northern', 'southern', 'eastern',
  'western', 'national', 'international', 'global', 'world', 'worldwide', 'europe', 'european', 'asian',
  'british', 'american', 'taiwan', 'tokyo',
  'branch', 'office', 'headquarters', 'division', 'department', 'dept', 'section', 'unit', 'team',
  'general', 'manager', 'director', 'president', 'executive', 'officer', 'chairman', 'supervisor',
  'engineer', 'specialist', 'consultant', 'coordinator', 'assistant', 'representative', 'agent',
  // Industrial / Hardware / Automotive / Company words (SUK / Machan domain)
  'company', 'corp', 'corporation', 'inc', 'incorporated', 'ltd', 'limited', 'plc', 'llc', 'llp',
  'group', 'holdings', 'holding', 'enterprise', 'enterprises', 'business', 'businesses', 'firm',
  'agency', 'bureau', 'institute', 'association', 'foundation', 'society', 'club', 'union', 'council',
  'authority', 'board', 'committee', 'commission', 'ministry', 'government', 'public', 'private',
  'commercial', 'commercials', 'trading', 'trade', 'import', 'export', 'wholesale', 'retail', 'direct',
  'supply', 'supplies', 'product', 'products', 'goods', 'in', 'item', 'items', 'material', 'materials',
  'equipment', 'machinery', 'machine', 'machines', 'tool', 'tools', 'tooling', 'hardware', 'software',
  'cabinet', 'cabinets', 'trolley', 'trolleys', 'workbench', 'chest', 'chests', 'box', 'boxes',
  'case', 'cases', 'rack', 'racks', 'shelf', 'shelves', 'locker', 'lockers', 'cart', 'carts',
  'heavy', 'duty', 'high', 'low', 'quality', 'standard', 'premium', 'pro', 'plus', 'ultra', 'super',
  'mini', 'micro', 'mega', 'multi', 'auto', 'automotive', 'motor', 'motors', 'motorcycles', 'motorfactors',
  'vehicle', 'vehicles', 'car', 'cars', 'truck', 'trucks', 'vans', 'bus', 'coach', 'fleet',
  'trailer', 'trailers', 'tyre', 'tyres', 'tire', 'tires', 'wheel', 'wheels', 'brake', 'brakes',
  'clutch', 'gear', 'gearbox', 'transmission', 'engine', 'engines', 'exhaust', 'battery', 'batteries',
  'body', 'bodyshop', 'paint', 'panel', 'windscreen', 'diesel', 'petrol', 'fuel', 'oil',
  'gas', 'power', 'energy', 'electric', 'electrical', 'electronic', 'electronics', 'digital',
  'mechanical', 'hydraulic', 'pneumatic', 'precision', 'calibration', 'testing', 'inspection',
  'engineering', 'construction', 'building', 'builders', 'property', 'properties', 'maintenance',
  'repair', 'repairs', 'workshop', 'garage', 'garages', 'station', 'depot', 'store', 'stores',
  'shop', 'shops', 'mart', 'market', 'outlet', 'factor', 'factors', 'spares', 'parts', 'components',
  'accessories', 'fittings', 'fasteners', 'fixings', 'bearings', 'seals', 'valves', 'pumps', 'pipes',
  'tubes', 'metal', 'metals', 'alloy', 'aluminum', 'aluminium', 'brass', 'copper',
  'plastic', 'plastics', 'rubber', 'timber', 'chemical', 'chemicals', 'coating', 'coatings',
  'welding', 'cutting', 'grinding', 'drilling', 'milling', 'turning', 'casting', 'forging', 'stamping',
  'molding', 'moulding', 'fabrication', 'manufacturing', 'manufacturer', 'makers', 'works', 'plant',
  'factory', 'mill', 'foundry', 'laboratory', 'labs', 'research', 'development', 'design', 'studio',
  'media', 'press', 'print', 'printing', 'publishing', 'graphics', 'sign', 'signs', 'display',
  'safety', 'security', 'protection', 'fire', 'rescue', 'recovery', 'breakdown', 'assistance',
  'hire', 'rental', 'rentals', 'leasing', 'contract', 'contracts', 'project', 'projects', 'plan',
  'first', 'second', 'third', 'fourth', 'fifth', 'sixth', 'seventh', 'eighth', 'ninth', 'tenth',
  'better', 'premier', 'choice', 'select', 'elite',
  'classic', 'modern', 'advanced', 'rapid',
  'golden', 'sky', 'earth', 'wind', 'wave', 'ocean',
  'mountain', 'valley', 'meadow',
  'garden', 'gardens', 'farm', 'farms', 'home',
  'inn', 'hotel', 'motel', 'pub', 'bar', 'cafe', 'restaurant', 'bakery',
  'food', 'foods', 'drink', 'drinks', 'health', 'medical', 'dental', 'clinic', 'hospital', 'pharmacy',
  'vet', 'veterinary', 'pet', 'pets', 'animal', 'animals', 'school', 'college', 'academy', 'university',
  'training', 'education', 'learning', 'sport', 'sports', 'fitness', 'gym', 'golf', 'racing', 'marine',
  'aviation', 'aero', 'aerospace', 'defense', 'defence', 'military', 'police', 'imperial',
  'crown', 'princess',
  'january', 'february', 'april', 'july', 'september', 'october', 'november', 'december',
  'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday',
  'dear', 'thanks', 'thank', 'regards', 'sincerely', 'yours', 'faithfully', 'truly', 'subject', 'ref',
  'reference', 'number', 'code', 'status', 'level', 'grade', 'class', 'category', 'series',
  'model', 'version', 'edition', 'issue', 'volume', 'part', 'chapter', 'article', 'clause',
  'point', 'line', 'row', 'column', 'table', 'chart', 'graph', 'figure', 'image', 'photo', 'picture',
  'view', 'mode', 'style', 'format', 'layout', 'theme', 'color', 'colour', 'size', 'weight', 'length',
  'width', 'height', 'depth', 'area', 'rate', 'ratio', 'scale', 'index', 'score', 'value',
  'card', 'cards', 'check', 'cheque', 'banking', 'fund', 'funds', 'capital',
  'asset', 'assets', 'equity', 'bonds', 'stock', 'stocks', 'share', 'shares',
]);

function isPlausibleEnName(match: string, before = ''): boolean {
  const rawTokens = match
    .trim()
    .split(/[\s/]+/)
    .map((w) => w.replace(/^[('.]+|[).',]+$/g, ''))
    .filter(Boolean);
  if (rawTokens.length === 0) return false;

  const hasHonorificInMatch = /^(?:Mr|Mrs|Ms|Miss|Dr|Prof)$/i.test(rawTokens[0]);
  const nameTokens = hasHonorificInMatch ? rawTokens.slice(1) : rawTokens;
  if (nameTokens.length === 0) return false;

  const lowerWords = nameTokens.map((w) => w.toLowerCase());

  // 1. Reject immediately if any token is a known business/report/industrial/company non-name word
  if (lowerWords.some((w) => EN_NON_NAME_WORDS.has(w))) return false;

  // 2. Check if in a structured contact slot ("Totals for account : <CODE>\n"; detector passes 24 chars in `before`)
  const inLedgerContactSlot = /account[\x20\t]*:[\x20\t]*[A-Z0-9&+\-]{2,12}[\r\n]+$/iu.test(before);
  if (inLedgerContactSlot) {
    return EN_GIVEN_NAMES.has(lowerWords[0]) || hasHonorificInMatch || nameTokens.length >= 2;
  }

  // Outside the structured ledger contact slot, require at least 2 name tokens (given + surname)
  if (nameTokens.length < 2) return false;

  // 3. Accept if has honorific in match or preceded by an explicit title/honorific or contact label
  if (
    hasHonorificInMatch ||
    /(?:Mr|Mrs|Ms|Miss|Dr|Prof)\.?\s*$|(?:\b(?:Contact|Attn|Attention|Manager|Director|Representative|Prepared\s+by|Signed\s+by|Approved\s+by)|(?:聯絡人|連絡人|承辦人|負責人|業務|主管|代表人|簽署人))\s*[:：]?\s*$/iu.test(
      before,
    ) ||
    /[\u4e00-\u9fa5]\s*[(（]\s*$/u.test(before)
  ) {
    return true;
  }

  // 4. Accept if the first word is a known English given name (e.g. Bryan Long, David Miller, Claire Pirie)
  const first = lowerWords[0];
  if (EN_GIVEN_NAMES.has(first)) return true;

  // 5. Accept if the surname is a common Romanized East Asian surname or Celtic patronymic (Mc/Mac/O')
  const last = lowerWords[lowerWords.length - 1];
  const rawLast = nameTokens[nameTokens.length - 1];
  if (EN_ROMANIZED_SURNAMES.has(last) || /^(?:Mc|Mac|O')[A-Z][a-z]{2,}$/.test(rawLast)) {
    return true;
  }

  return false;
}

export const BUILTIN_PATTERNS: Pattern[] = [
  {
    id: 'machan-customers',
    name: '明昌企業客戶（全名／縮寫／簡稱）',
    group: 'tw',
    note: '對照明昌 157 家客戶與業務資料庫，自動辨識客戶全名、縮寫與商標簡稱，並自動編碼為客戶編號（如 CA0001、CD0006）',
    category: '客戶',
    source: 'builtin',
    regex: CUSTOMER_REGEX_SOURCE,
    flags: 'giu',
    example: 'Grainger、Apex Tool Group、Bunnings、Home Depot、Harbor Freight、Milwaukee、Wera、FACOM',
    enabled: true,
    validate: (match: string) => {

      const cust = findCustomerByAlias(match);
      return Boolean(cust);
    },
    getCustomCode: (match: string) => {
      const cust = findCustomerByAlias(match);
      return cust?.code;
    },
  },
  {
    id: 'contextual-customer',
    name: '客戶名稱（文脈與欄位自動判定）',
    group: 'tw',
    note: '自動辨識「客戶／買受人／買方／終端客戶／採購單位／Customer／Client」等欄位或文脈標籤後之公司名稱、姓名或組織',
    category: '客戶',
    source: 'builtin',
    regex: CONTEXTUAL_CUSTOMER_REGEX,
    flags: 'gu',
    example: '買受人全名：Grainger International Inc.、客戶名稱：台塑石化、Customer: Stanley Black & Decker、客戶：王小明',
    enabled: true,
    validate: (match: string) => {
      const trimmed = match.trim().replace(/[\s,，;；。]+$/, '');
      if (trimmed.length < 2) return false;
      if (/^(?:無|同上|詳見附件|如前述|不適用|N\/A|None|Nil)$/i.test(trimmed)) return false;
      if (/^(?:本單|僅供|僅限|限|適用於|須由|如前述|依據)/.test(trimmed)) return false;
      if (/(?:專案專用|排產結關|不可撤銷|另行約定|付清|付訖|確認無誤|請參照)/.test(trimmed)) return false;
      if (!/[A-Za-z\u4e00-\u9fa5]/.test(trimmed)) return false;
      return trimmed.length;
    },
    getCustomCode: (match: string) => {
      const cust = findCustomerByAlias(match.trim().replace(/[\s,，;；.。]+$/, ''));
      return cust?.code;
    },
  },
  {
    id: 'zh-name',
    name: '中文姓名',
    group: 'tw',
    note: '常見姓氏（含複姓）加 1–2 字名，以前後文判斷名字長度；排除常見詞（高雄、方法…）與「甲方／雙方」',
    category: '姓名',
    source: 'builtin',
    regex: NAME_REGEX,
    example: '王小明、歐陽志遠',
    enabled: true,
    validate: isPlausibleName,
  },
  {
    id: 'tw-id',
    name: '台灣身分證字號',
    group: 'tw',
    note: '身分證檢核碼驗證，錯誤的號碼不命中',
    category: '身分證',
    source: 'builtin',
    regex: '(?<![A-Za-z0-9])[A-Z][12]\\d{8}(?!\\d)',
    example: 'A123456789',
    enabled: true,
    validate: isValidTwId,
  },
  // Before 市話: a labelled SSN of 9 bare digits starting with 0 also reads as a Kaohsiung number.
  // Unlabelled it needs 3-2-4 separators, which no Taiwanese format uses.
  {
    id: 'us-ssn',
    name: '美國社會安全碼（SSN）',
    group: 'intl',
    note: '排除 000、666、9xx 區碼與 00 組碼、0000 序號；「SSN:」標籤後的 9 位數也算',
    category: 'SSN',
    source: 'builtin',
    regex:
      '(?<![\\d-])(?:\\d{3}-\\d{2}-\\d{4}|\\d{3}\\x20\\d{2}\\x20\\d{4})(?![\\d-])' +
      '|(?<=(?:SSN|Social Security (?:Number|No\\.?))\\s*[:#：]?\\s*)\\d{9}(?!\\d)',
    example: '123-45-6789、SSN: 123456789',
    enabled: true,
    validate: isSsn,
  },
  {
    id: 'tw-mobile',
    name: '手機號碼',
    group: 'tw',
    note: '09 開頭或 +886 9 開頭，前後不得緊鄰數字',
    category: '手機',
    source: 'builtin',
    regex: '(?<![\\d+])(?:\\+886[-\\x20]?9|09)\\d{2}[-\\x20]?\\d{3}[-\\x20]?\\d{3}(?!\\d)',
    example: '0912-345-678、0912345678、+886-912-345-678',
    enabled: true,
  },
  {
    id: 'tw-landline',
    name: '市話號碼',
    group: 'tw',
    note: '依區碼要求位數，8 位數統編不會被當成市話；含 +886 寫法',
    category: '市話',
    source: 'builtin',
    // Separated/parenthesised forms, or unseparated forms with the exact digit count per area
    // code (02/04: 10 digits, 03–08: 9, 082/089: 9, 0826/0836: 9) so an 8-digit 統編 is never a 市話.
    regex:
      '(?<![\\d(])(?:\\(0(?:826|836|82|89|37|49|[2-8])\\)[-\\x20]?\\d{3,4}[-\\x20]?\\d{3,4}' +
      '|0(?:826|836|82|89|37|49|[2-8])[-\\x20]\\d{3,4}[-\\x20]?\\d{3,4}' +
      '|0[24]\\d{8}|0[3-8]\\d{7}|08[29]\\d{6}|08[23]6\\d{5}|' + TW_LANDLINE_INTL + ')(?!\\d)',
    example: '(02)2712-3456、02-27123456、0227123456、037-123456、+886-2-2712-3456',
    enabled: true,
  },
  {
    id: 'tw-address',
    name: '台灣地址',
    group: 'tw',
    note: '以縣市名為錨點，含鄉鎮市區、路街段巷弄號樓',
    category: '地址',
    source: 'builtin',
    regex: ADDRESS_REGEX,
    example: '台北市信義區市府路45號8樓',
    enabled: true,
  },
  {
    id: 'tw-company',
    name: '公司／組織名稱',
    group: 'tw',
    note: '以股份有限公司、有限公司、事務所、診所、基金會等結尾；排除「本／該／貴公司」',
    category: '公司',
    source: 'builtin',
    regex: COMPANY_REGEX,
    example: '築夢實業股份有限公司、大安聯合診所',
    enabled: true,
  },
  {
    id: 'tw-tax-id',
    name: '統一編號',
    group: 'tw',
    note: '統一編號檢核碼驗證（含 2023 年新制）',
    category: '統編',
    source: 'builtin',
    regex: '(?<![\\d-])\\d{8}(?![\\d-])',
    example: '統一編號 04595257',
    enabled: true,
    validate: isValidTaxId,
  },
  {
    id: 'intl-company',
    name: '國際／外商企業名稱',
    group: 'intl',
    note: '以 Inc.、LLC、Ltd.、Corp.、Co.、GmbH、AG 等組織型態結尾，或知名跨國企業聯名商標',
    category: '公司',
    source: 'builtin',
    regex: INTL_COMPANY_REGEX,
    flags: 'gu',
    example: 'Grainger International Inc.、Apex Tool Group, LLC、Bosch GmbH、Stanley Black & Decker',
    enabled: true,
    validate: (match: string) => {
      const trimmed = match.trim().replace(/[\s,，;；。]+$/, '');
      if (trimmed.length < 3) return false;
      return trimmed.length;
    },
    getCustomCode: (match: string) => {
      const cust = findCustomerByAlias(match.trim().replace(/[\s,，;；.。]+$/, ''));
      return cust?.code;
    },
  },
  {
    id: 'en-name',
    name: '英文姓名',
    group: 'intl',
    note: '常見英文教名、英譯華人姓氏或稱謂／聯絡人欄位後之姓名（如 David Miller、Elliott Chang、Bryan Long），排除報表表頭與商務詞彙',
    category: '姓名',
    source: 'builtin',
    regex: EN_NAME_REGEX,
    flags: 'gu',
    example: 'David Miller、Elliott Chang、Bryan Long',
    enabled: true,
    validate: isPlausibleEnName,
  },
  {
    id: 'email',
    name: '電子郵件',
    group: 'intl',
    category: '電子郵件',
    source: 'builtin',
    regex: '[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\\.[A-Za-z]{2,}',
    example: 'someone@example.com',
    enabled: true,
  },
  // International formats (specs/007-intl-pii-patterns). After the Taiwanese rules, so a +886 number
  // they both match stays 手機 or 市話.
  {
    id: 'intl-phone',
    name: '國際電話',
    group: 'intl',
    note: '含國碼的各國號碼或北美格式，以 libphonenumber 驗證號碼有效性；+886 號碼歸手機／市話',
    category: '國際電話',
    source: 'builtin',
    regex:
      '(?<![\\w+])(?:\\+[1-9]\\d{0,2}(?:[\\x20.-]?(?:\\(\\d{1,4}\\)|\\d{1,5})){1,6}' +
      '|(?:\\(\\d{3}\\)\\x20?|\\d{3}[-.\\x20])\\d{3}[-.\\x20]\\d{4})(?!\\w)',
    example: '+1 (415) 867-5309、+44 20 7946 0958、(416) 967-1111',
    enabled: true,
    validate: phoneLength,
  },
  {
    id: 'credit-card',
    name: '信用卡號',
    group: 'intl',
    note: 'Luhn 檢核＋發卡機構號段（Visa、Mastercard、AmEx、Discover、JCB、UnionPay、Diners）＋常見分組格式',
    category: '信用卡',
    source: 'builtin',
    regex: '(?<![\\d-])\\d(?:[\\x20-]?\\d){12,18}(?![\\d-])',
    example: '4242 4242 4242 4242、3782 822463 10005',
    enabled: true,
    validate: isCardNumber,
  },
  {
    id: 'iban',
    name: 'IBAN 國際銀行帳號',
    group: 'intl',
    note: 'mod-97 檢核碼＋各國固定長度',
    category: 'IBAN',
    source: 'builtin',
    regex: '(?<![A-Za-z0-9])[A-Z]{2}\\d{2}(?:\\x20?[A-Z0-9]{4}){2,7}(?:\\x20?[A-Z0-9]{1,3})?(?![A-Za-z0-9])',
    example: 'GB82 WEST 1234 5698 7654 32、DE89370400440532013000',
    enabled: true,
    validate: ibanLength,
  },
  {
    id: 'ipv4',
    name: 'IPv4 位址',
    group: 'intl',
    note: '各段 0–255，排除版本號',
    category: 'IP',
    source: 'builtin',
    regex: '(?<![\\d.])(?:(?:25[0-5]|2[0-4]\\d|1\\d\\d|[1-9]?\\d)\\.){3}(?:25[0-5]|2[0-4]\\d|1\\d\\d|[1-9]?\\d)(?!\\.?\\d)',
    example: '192.168.1.10',
    enabled: true,
  },
  {
    id: 'ipv6',
    name: 'IPv6 位址',
    group: 'intl',
    note: '以瀏覽器內建的網址解析驗證，排除時間與 MAC 位址',
    category: 'IP',
    source: 'builtin',
    regex: '(?<![\\w:.])(?:[0-9A-Fa-f]{0,4}:){2,7}[0-9A-Fa-f]{1,4}(?![\\w:])',
    example: '2001:db8::1',
    enabled: true,
    validate: isIpv6,
  },
  {
    id: 'dob',
    name: '出生日期',
    group: 'intl',
    note: '只偵測「DOB／Date of Birth／Birthday／Born／出生日期／生日」等標籤後、同一行的日期；驗證月日',
    category: '生日',
    source: 'builtin',
    regex: BIRTH_DATE,
    example: 'DOB: 1985-03-14、Date of Birth: March 14, 1985、出生日期：民國 80 年 5 月 1 日',
    enabled: true,
    validate: isBirthDate,
  },
];
