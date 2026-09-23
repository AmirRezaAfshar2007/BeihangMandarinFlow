import OpenAI from 'openai';
import { DictionaryApiResponse } from '../types.ts';
import { env } from '../config/env.ts';

// Alibaba Cloud Bailian / DashScope — Qwen models.
//
// This replaced the Google Gemini integration (@google/genai), which was
// unreachable from mainland China without a VPN. DashScope's Beijing-region
// endpoint below is a normal Alibaba Cloud domestic host, reachable the same
// way Taobao/Alipay are, and exposes an OpenAI-compatible Chat Completions
// API — so we reuse the standard `openai` npm client and just point it at a
// different base URL instead of hand-rolling HTTP calls.
//
// Get a key at https://bailian.console.aliyun.com (mainland account, no
// overseas billing needed) → API-KEY管理 → create key → set DASHSCOPE_API_KEY.
const DASHSCOPE_BASE_URL = 'https://dashscope.aliyuncs.com/compatible-mode/v1';

// Bounded on purpose. The SDK's defaults are a 10-minute timeout with 2
// automatic retries, which for a web request means: one unreachable/slow AI
// endpoint pins an Express request (and everything it holds) for up to half an
// hour before answering. For a classroom-facing endpoint that is worse than
// failing — the student sees a spinner forever and the slot is never freed.
// A single retry keeps the occasional dropped connection self-healing without
// multiplying load on an AI service that is already struggling.
const AI_REQUEST_TIMEOUT_MS = 90_000;
const AI_MAX_RETRIES = 1;

let aiClient: OpenAI | null = null;

export function getQwenClient(): OpenAI | null {
  const apiKey = env.dashscopeApiKey;
  if (!apiKey) {
    console.warn('Sino3D AI Engine key (DASHSCOPE_API_KEY) is not defined. Offline dictionary fallback active.');
    return null;
  }
  if (!aiClient) {
    aiClient = new OpenAI({
      apiKey,
      baseURL: DASHSCOPE_BASE_URL,
      timeout: AI_REQUEST_TIMEOUT_MS,
      maxRetries: AI_MAX_RETRIES,
    });
  }
  return aiClient;
}

/**
 * Qwen's JSON mode is well-documented and reliable for pure-text models
 * (qwen-plus, qwen-flash), but is not guaranteed the same way for the
 * audio-input Qwen-Omni models used by the Speaking Coach. This is a
 * defensive extractor used by both: it strips ```json code fences and pulls
 * out the outermost {...} block, so a stray sentence before/after the JSON
 * (which Omni-style models occasionally add despite instructions) doesn't
 * break JSON.parse.
 */
export function extractJsonObject(raw: string): any {
  const text = raw.trim();
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1].trim() : text;
  const start = candidate.indexOf('{');
  const end = candidate.lastIndexOf('}');
  if (start === -1 || end === -1 || end < start) {
    throw new Error('No JSON object found in AI response.');
  }
  return JSON.parse(candidate.slice(start, end + 1));
}

// Extensive local high-quality dictionary of common characters
const LOCAL_FALLBACK_DICT: { [key: string]: DictionaryApiResponse } = {
  '你': {
    character: '你', simplified: '你', traditional: '你', pinyin: 'nǐ',
    englishMeaning: 'you (singular, polite)', persianMeaning: '',
    radicals: ['人', '尔'], strokeCount: 7, hskLevel: 1, frequencyRank: 9,
    exampleWords: [
      { word: '你好', pinyin: 'nǐ hǎo', meaning: 'hello' },
      { word: '你们', pinyin: 'nǐ men', meaning: 'you (plural)' }
    ],
    exampleSentences: [
      { sentence: '你好吗？', pinyin: 'Nǐ hǎo ma?', meaning: 'How are you?' }
    ]
  },
  '我': {
    character: '我', simplified: '我', traditional: '我', pinyin: 'wǒ',
    englishMeaning: 'I; me; myself', persianMeaning: '',
    radicals: ['戈'], strokeCount: 7, hskLevel: 1, frequencyRank: 10,
    exampleWords: [
      { word: '我们', pinyin: 'wǒ men', meaning: 'we; us' },
      { word: '我家', pinyin: 'wǒ jiā', meaning: 'my home' }
    ],
    exampleSentences: [
      { sentence: '我是一个学生。', pinyin: 'Wǒ shì yī gè xuésheng.', meaning: 'I am a student.' }
    ]
  },
  '好': {
    character: '好', simplified: '好', traditional: '好', pinyin: 'hǎo',
    englishMeaning: 'good; well; fine; nice', persianMeaning: '',
    radicals: ['女', '子'], strokeCount: 6, hskLevel: 1, frequencyRank: 14,
    exampleWords: [
      { word: '好看', pinyin: 'hǎo kàn', meaning: 'good-looking' },
      { word: '好吃', pinyin: 'hǎo chī', meaning: 'delicious' }
    ],
    exampleSentences: [
      { sentence: '今天天气很好。', pinyin: 'Jīntiān tiānqì hěn hǎo.', meaning: 'Today\'s weather is very good.' }
    ]
  },
  '学': {
    character: '学', simplified: '学', traditional: '學', pinyin: 'xué',
    englishMeaning: 'to learn; to study; science', persianMeaning: '',
    radicals: ['子'], strokeCount: 8, hskLevel: 1, frequencyRank: 105,
    exampleWords: [
      { word: '学生', pinyin: 'xué sheng', meaning: 'student' },
      { word: '学校', pinyin: 'xué xiào', meaning: 'school' }
    ],
    exampleSentences: [
      { sentence: '我喜欢学习中文。', pinyin: 'Wǒ xǐhuan xuéxí Zhōngwén.', meaning: 'I like studying Chinese.' }
    ]
  },
  '爱': {
    character: '爱', simplified: '爱', traditional: '愛', pinyin: 'ài',
    englishMeaning: 'to love; affection; to be fond of', persianMeaning: '',
    radicals: ['爪', '友'], strokeCount: 10, hskLevel: 1, frequencyRank: 132,
    exampleWords: [
      { word: '爱好', pinyin: 'ài hào', meaning: 'hobby' },
      { word: '可爱', pinyin: 'kě ài', meaning: 'cute; lovely' }
    ],
    exampleSentences: [
      { sentence: '我爱我的家人。', pinyin: 'Wǒ ài wǒ de jiārén.', meaning: 'I love my family.' }
    ]
  },
  '谢': {
    character: '谢', simplified: '谢', traditional: '謝', pinyin: 'xiè',
    englishMeaning: 'to thank; to decline; to wither', persianMeaning: '',
    radicals: ['言', '身', '寸'], strokeCount: 12, hskLevel: 1, frequencyRank: 318,
    exampleWords: [
      { word: '谢谢', pinyin: 'xiè xie', meaning: 'thank you' },
      { word: '感谢', pinyin: 'gǎn xiè', meaning: 'to thank; grateful' }
    ],
    exampleSentences: [
      { sentence: '谢谢你的帮助。', pinyin: 'Xièxie nǐ de bāngzhù.', meaning: 'Thank you for your help.' }
    ]
  },
  '国': {
    character: '国', simplified: '国', traditional: '國', pinyin: 'guó',
    englishMeaning: 'country; nation; state', persianMeaning: '',
    radicals: ['囗', '玉'], strokeCount: 8, hskLevel: 1, frequencyRank: 11,
    exampleWords: [
      { word: '中国', pinyin: 'Zhōng guó', meaning: 'China' },
      { word: '国家', pinyin: 'guó jiā', meaning: 'country; nation' }
    ],
    exampleSentences: [
      { sentence: '中国是一个很大的国家。', pinyin: 'Zhōngguó shì yī gè hěn dà de guójiā.', meaning: 'China is a very large country.' }
    ]
  },
  '明': {
    character: '明', simplified: '明', traditional: '明', pinyin: 'míng',
    englishMeaning: 'bright; clear; next; understand', persianMeaning: '',
    radicals: ['日', '月'], strokeCount: 8, hskLevel: 1, frequencyRank: 67,
    exampleWords: [
      { word: '明天', pinyin: 'míng tiān', meaning: 'tomorrow' },
      { word: '明白', pinyin: 'míng bai', meaning: 'to understand' }
    ],
    exampleSentences: [
      { sentence: '明天会下雨吗？', pinyin: 'Míngtiān huì xiàyǔ ma?', meaning: 'Will it rain tomorrow?' }
    ]
  },
  '日': {
    character: '日', simplified: '日', traditional: '日', pinyin: 'rì',
    englishMeaning: 'sun; day; daytime', persianMeaning: '',
    radicals: ['日'], strokeCount: 4, hskLevel: 1, frequencyRank: 44,
    exampleWords: [
      { word: '日子', pinyin: 'rì zi', meaning: 'day; life' },
      { word: '生日', pinyin: 'shēng rì', meaning: 'birthday' }
    ],
    exampleSentences: [
      { sentence: '今天是我的生日。', pinyin: 'Jīntiān shì wǒ de shēngrì.', meaning: 'Today is my birthday.' }
    ]
  },
  '山': {
    character: '山', simplified: '山', traditional: '山', pinyin: 'shān',
    englishMeaning: 'mountain; hill; peak', persianMeaning: '',
    radicals: ['山'], strokeCount: 3, hskLevel: 1, frequencyRank: 280,
    exampleWords: [
      { word: '山脉', pinyin: 'shān mài', meaning: 'mountain range' },
      { word: '爬山', pinyin: 'pá shān', meaning: 'mountain climbing' }
    ],
    exampleSentences: [
      { sentence: '那座山非常高。', pinyin: 'Nà zuò shān fēicháng gāo.', meaning: 'That mountain is very high.' }
    ]
  },
  '水': {
    character: '水', simplified: '水', traditional: '水', pinyin: 'shuǐ',
    englishMeaning: 'water; liquid; river', persianMeaning: '',
    radicals: ['水'], strokeCount: 4, hskLevel: 1, frequencyRank: 110,
    exampleWords: [
      { word: '水果', pinyin: 'shuǐ guǒ', meaning: 'fruit' },
      { word: '喝水', pinyin: 'hē shuǐ', meaning: 'to drink water' }
    ],
    exampleSentences: [
      { sentence: '请给我一杯水。', pinyin: 'Qǐng gěi wǒ yī bēi shuǐ.', meaning: 'Please give me a glass of water.' }
    ]
  },
  '火': {
    character: '火', simplified: '火', traditional: '火', pinyin: 'huǒ',
    englishMeaning: 'fire; flame; urgent; anger', persianMeaning: '',
    radicals: ['火'], strokeCount: 4, hskLevel: 1, frequencyRank: 350,
    exampleWords: [
      { word: '火车', pinyin: 'huǒ chē', meaning: 'train' },
      { word: '火山', pinyin: 'huǒ shān', meaning: 'volcano' }
    ],
    exampleSentences: [
      { sentence: '我们在烤火。', pinyin: 'Wǒmen zài kǎohuǒ.', meaning: 'We are warming ourselves by the fire.' }
    ]
  },
  '木': {
    character: '木', simplified: '木', traditional: '木', pinyin: 'mù',
    englishMeaning: 'tree; wood; log; simple', persianMeaning: '',
    radicals: ['木'], strokeCount: 4, hskLevel: 1, frequencyRank: 240,
    exampleWords: [
      { word: '木头', pinyin: 'mù tou', meaning: 'wood' },
      { word: '树木', pinyin: 'shù mù', meaning: 'trees' }
    ],
    exampleSentences: [
      { sentence: '这张桌子是木头做的。', pinyin: 'Zhè zhāng zhuōzi shì mùtou zuò de.', meaning: 'This table is made of wood.' }
    ]
  },
  '人': {
    character: '人', simplified: '人', traditional: '人', pinyin: 'rén',
    englishMeaning: 'person; people; human being', persianMeaning: '',
    radicals: ['人'], strokeCount: 2, hskLevel: 1, frequencyRank: 8,
    exampleWords: [
      { word: '人们', pinyin: 'rén men', meaning: 'people' },
      { word: '人类', pinyin: 'rén lèi', meaning: 'humanity' }
    ],
    exampleSentences: [
      { sentence: '那个人是我的老师。', pinyin: 'Nà ge rén shì wǒ de lǎoshī.', meaning: 'That person is my teacher.' }
    ]
  },
  '天': {
    character: '天', simplified: '天', traditional: '天', pinyin: 'tiān',
    englishMeaning: 'sky; heaven; day; season', persianMeaning: '',
    radicals: ['大'], strokeCount: 4, hskLevel: 1, frequencyRank: 16,
    exampleWords: [
      { word: '天气', pinyin: 'tiān qì', meaning: 'weather' },
      { word: '今天', pinyin: 'jīn tiān', meaning: 'today' }
    ],
    exampleSentences: [
      { sentence: '今天天气非常晴朗。', pinyin: 'Jīntiān tiānqì fēicháng qínglǎng.', meaning: 'Today\'s weather is very sunny.' }
    ]
  },
  '地': {
    character: '地', simplified: '地', traditional: '地', pinyin: 'dì',
    englishMeaning: 'earth; ground; field; place', persianMeaning: '',
    radicals: ['土'], strokeCount: 6, hskLevel: 1, frequencyRank: 20,
    exampleWords: [
      { word: '地方', pinyin: 'dì fang', meaning: 'place; region' },
      { word: '地球', pinyin: 'dì qiú', meaning: 'the Earth' }
    ],
    exampleSentences: [
      { sentence: '这个地方很漂亮。', pinyin: 'Zhège dìfang hěn piàoliang.', meaning: 'This place is very beautiful.' }
    ]
  },
  '月': {
    character: '月', simplified: '月', traditional: '月', pinyin: 'yuè',
    englishMeaning: 'moon; month; monthly', persianMeaning: '',
    radicals: ['月'], strokeCount: 4, hskLevel: 1, frequencyRank: 31,
    exampleWords: [
      { word: '月亮', pinyin: 'yuè liang', meaning: 'moon' },
      { word: '月球', pinyin: 'yuè qiú', meaning: 'the moon' }
    ],
    exampleSentences: [
      { sentence: '今晚的月亮很圆。', pinyin: 'Jīnwǎn de yuèliang hěn yuán.', meaning: 'The moon is very round tonight.' }
    ]
  },
  '风': {
    character: '风', simplified: '风', traditional: '風', pinyin: 'fēng',
    englishMeaning: 'wind; breeze; custom; style', persianMeaning: '',
    radicals: ['风'], strokeCount: 4, hskLevel: 1, frequencyRank: 275,
    exampleWords: [
      { word: '刮风', pinyin: 'guā fēng', meaning: 'windy; to blow wind' },
      { word: '风景', pinyin: 'fēng jǐng', meaning: 'scenery; landscape' }
    ],
    exampleSentences: [
      { sentence: '外面刮起了大风。', pinyin: 'Wàimiàn guā qǐ le dà fēng.', meaning: 'A strong wind started blowing outside.' }
    ]
  },
  '雨': {
    character: '雨', simplified: '雨', traditional: '雨', pinyin: 'yǔ',
    englishMeaning: 'rain; rainy', persianMeaning: '',
    radicals: ['雨'], strokeCount: 8, hskLevel: 1, frequencyRank: 420,
    exampleWords: [
      { word: '下雨', pinyin: 'xià yǔ', meaning: 'to rain' },
      { word: '雨衣', pinyin: 'yǔ yī', meaning: 'raincoat' }
    ],
    exampleSentences: [
      { sentence: '外面正在下雨。', pinyin: 'Wàimiàn zhèngzài xiàyǔ.', meaning: 'It is raining outside.' }
    ]
  },
  '书': {
    character: '书', simplified: '书', traditional: '書', pinyin: 'shū',
    englishMeaning: 'book; letter; script; to write', persianMeaning: '',
    radicals: ['乛'], strokeCount: 4, hskLevel: 1, frequencyRank: 165,
    exampleWords: [
      { word: '读书', pinyin: 'dú shū', meaning: 'to read; to study' },
      { word: '图书馆', pinyin: 'tú shū guǎn', meaning: 'library' }
    ],
    exampleSentences: [
      { sentence: '我很喜欢看书。', pinyin: 'Wǒ hěn xǐhuan kànshū.', meaning: 'I like reading books very much.' }
    ]
  },
  '中': {
    character: '中', simplified: '中', traditional: '中', pinyin: 'zhōng',
    englishMeaning: 'middle; center; within; China', persianMeaning: '',
    radicals: ['丨'], strokeCount: 4, hskLevel: 1, frequencyRank: 4,
    exampleWords: [
      { word: '中文', pinyin: 'Zhōng wén', meaning: 'Chinese language' },
      { word: '中心', pinyin: 'zhōng xīn', meaning: 'center' }
    ],
    exampleSentences: [
      { sentence: '他在中文学校学习。', pinyin: 'Tā zài Zhōngwén xuéxiào xuéxí.', meaning: 'He studies at a Chinese school.' }
    ]
  },
  '大': {
    character: '大', simplified: '大', traditional: '大', pinyin: 'dà',
    englishMeaning: 'big; huge; large; great', persianMeaning: '',
    radicals: ['大'], strokeCount: 3, hskLevel: 1, frequencyRank: 13,
    exampleWords: [
      { word: '大家', pinyin: 'dà jiā', meaning: 'everyone' },
      { word: '大学', pinyin: 'dà xué', meaning: 'university' }
    ],
    exampleSentences: [
      { sentence: '这个苹果很大。', pinyin: 'Zhège píngguǒ hěn dà.', meaning: 'This apple is very big.' }
    ]
  },
  '小': {
    character: '小', simplified: '小', traditional: '小', pinyin: 'xiǎo',
    englishMeaning: 'small; tiny; young', persianMeaning: '',
    radicals: ['小'], strokeCount: 3, hskLevel: 1, frequencyRank: 32,
    exampleWords: [
      { word: '小孩', pinyin: 'xiǎo hái', meaning: 'child' },
      { word: '小说', pinyin: 'xiǎo shuō', meaning: 'novel' }
    ],
    exampleSentences: [
      { sentence: '那只小猫非常可爱。', pinyin: 'Nà zhī xiǎomāo fēicháng kě’ài.', meaning: 'That little cat is very cute.' }
    ]
  },
  '多': {
    character: '多', simplified: '多', traditional: '多', pinyin: 'duō',
    englishMeaning: 'many; much; numerous; more than', persianMeaning: '',
    radicals: ['夕'], strokeCount: 6, hskLevel: 1, frequencyRank: 33,
    exampleWords: [
      { word: '多少', pinyin: 'duō shao', meaning: 'how much; how many' },
      { word: '许多', pinyin: 'xǔ duō', meaning: 'many; a lot' }
    ],
    exampleSentences: [
      { sentence: '这里有很多人。', pinyin: 'Zhèli yǒu hěn duō rén.', meaning: 'There are many people here.' }
    ]
  },
  '少': {
    character: '少', simplified: '少', traditional: '少', pinyin: 'shǎo',
    englishMeaning: 'few; little; lack; young', persianMeaning: '',
    radicals: ['小'], strokeCount: 4, hskLevel: 1, frequencyRank: 104,
    exampleWords: [
      { word: '少年', pinyin: 'shào nián', meaning: 'youth' },
      { word: '少数', pinyin: 'shǎo shù', meaning: 'minority' }
    ],
    exampleSentences: [
      { sentence: '杯子里的水很少。', pinyin: 'Bēizi lǐ de shuǐ hěn shǎo.', meaning: 'There is very little water in the glass.' }
    ]
  },
  '一': {
    character: '一', simplified: '一', traditional: '一', pinyin: 'yī',
    englishMeaning: 'one; single; whole; as soon as', persianMeaning: '',
    radicals: ['一'], strokeCount: 1, hskLevel: 1, frequencyRank: 1,
    exampleWords: [
      { word: '一个', pinyin: 'yī gè', meaning: 'one; a' },
      { word: '第一', pinyin: 'dì yī', meaning: 'first' }
    ],
    exampleSentences: [
      { sentence: '请给我一个苹果。', pinyin: 'Qǐng gěi wǒ yī gè píngguǒ.', meaning: 'Please give me an apple.' }
    ]
  },
  '二': {
    character: '二', simplified: '二', traditional: '二', pinyin: 'èr',
    englishMeaning: 'two; dual; stupid (slang)', persianMeaning: '',
    radicals: ['二'], strokeCount: 2, hskLevel: 1, frequencyRank: 51,
    exampleWords: [
      { word: '二十', pinyin: 'èr shí', meaning: 'twenty' },
      { word: '第二', pinyin: 'dì èr', meaning: 'second' }
    ],
    exampleSentences: [
      { sentence: '他买了两本书。', pinyin: 'Tā mǎi le liǎng běn shū.', meaning: 'He bought two books.' }
    ]
  },
  '三': {
    character: '三', simplified: '三', traditional: '三', pinyin: 'sān',
    englishMeaning: 'three; triple; several', persianMeaning: '',
    radicals: ['一'], strokeCount: 3, hskLevel: 1, frequencyRank: 42,
    exampleWords: [
      { word: '三十', pinyin: 'sān shí', meaning: 'thirty' },
      { word: '第三', pinyin: 'dì sān', meaning: 'third' }
    ],
    exampleSentences: [
      { sentence: '这里有三只猫。', pinyin: 'Zhèli yǒu sān zhī māo.', meaning: 'There are three cats here.' }
    ]
  },
  '四': {
    character: '四', simplified: '四', traditional: '四', pinyin: 'sì',
    englishMeaning: 'four; quad', persianMeaning: '',
    radicals: ['囗'], strokeCount: 5, hskLevel: 1, frequencyRank: 109,
    exampleWords: [
      { word: '四十', pinyin: 'sì shí', meaning: 'forty' },
      { word: '第四', pinyin: 'dì sì', meaning: 'fourth' }
    ],
    exampleSentences: [
      { sentence: '一年有四个季节。', pinyin: 'Yī nián yǒu sì gè jìjié.', meaning: 'A year has four seasons.' }
    ]
  },
  '五': {
    character: '五', simplified: '五', traditional: '五', pinyin: 'wǔ',
    englishMeaning: 'five', persianMeaning: '',
    radicals: ['二'], strokeCount: 4, hskLevel: 1, frequencyRank: 111,
    exampleWords: [
      { word: '五十', pinyin: 'wǔ shí', meaning: 'fifty' },
      { word: '五月', pinyin: 'wǔ yuè', meaning: 'May' }
    ],
    exampleSentences: [
      { sentence: '我的学校有五个教室。', pinyin: 'Wǒ de xuéxiào yǒu wǔ gè jiàoshì.', meaning: 'My school has five classrooms.' }
    ]
  },
  '六': {
    character: '六', simplified: '六', traditional: '六', pinyin: 'liù',
    englishMeaning: 'six; smooth (slang)', persianMeaning: '',
    radicals: ['八'], strokeCount: 4, hskLevel: 1, frequencyRank: 266,
    exampleWords: [
      { word: '六十', pinyin: 'liù shí', meaning: 'sixty' },
      { word: '六月', pinyin: 'liù yuè', meaning: 'June' }
    ],
    exampleSentences: [
      { sentence: '一个星期有六个工作日。', pinyin: 'Yī gè xīngqī yǒu liù gè gōngzuòrì.', meaning: 'A week has six working days.' }
    ]
  },
  '七': {
    character: '七', simplified: '七', traditional: '七', pinyin: 'qī',
    englishMeaning: 'seven', persianMeaning: '',
    radicals: ['一'], strokeCount: 2, hskLevel: 1, frequencyRank: 338,
    exampleWords: [
      { word: '七十', pinyin: 'qī shí', meaning: 'seventy' },
      { word: '七月', pinyin: 'qī yuè', meaning: 'July' }
    ],
    exampleSentences: [
      { sentence: '一星期有七天。', pinyin: 'Yī xīngqī yǒu qī tiān.', meaning: 'There are seven days in a week.' }
    ]
  },
  '八': {
    character: '八', simplified: '八', traditional: '八', pinyin: 'bā',
    englishMeaning: 'eight; fortune', persianMeaning: '',
    radicals: ['八'], strokeCount: 2, hskLevel: 1, frequencyRank: 295,
    exampleWords: [
      { word: '八十', pinyin: 'bā shí', meaning: 'eighty' },
      { word: '八月', pinyin: 'bā yuè', meaning: 'August' }
    ],
    exampleSentences: [
      { sentence: '他八点去上学。', pinyin: 'Tā bā diǎn qù shàngxué.', meaning: 'He goes to school at eight o\'clock.' }
    ]
  },
  '九': {
    character: '九', simplified: '九', traditional: '九', pinyin: 'jiǔ',
    englishMeaning: 'nine; long-lasting', persianMeaning: '',
    radicals: ['丿'], strokeCount: 2, hskLevel: 1, frequencyRank: 355,
    exampleWords: [
      { word: '九十', pinyin: 'jiǔ shí', meaning: 'ninety' },
      { word: '九月', pinyin: 'jiǔ yuè', meaning: 'September' }
    ],
    exampleSentences: [
      { sentence: '我今年九岁了。', pinyin: 'Wǒ jīnnián jiǔ suì le.', meaning: 'I am nine years old this year.' }
    ]
  },
  '十': {
    character: '十', simplified: '十', traditional: '十', pinyin: 'shí',
    englishMeaning: 'ten; complete; top', persianMeaning: '',
    radicals: ['十'], strokeCount: 2, hskLevel: 1, frequencyRank: 40,
    exampleWords: [
      { word: '十足', pinyin: 'shí zú', meaning: 'ample; complete' },
      { word: '十年', pinyin: 'shí nián', meaning: 'ten years' }
    ],
    exampleSentences: [
      { sentence: '这个班级有十个学生。', pinyin: 'Zhège bānjí yǒu shí gè xuésheng.', meaning: 'This class has ten students.' }
    ]
  },
  '是': {
    character: '是', simplified: '是', traditional: '是', pinyin: 'shì',
    englishMeaning: 'to be; yes; correct; indeed', persianMeaning: '',
    radicals: ['日'], strokeCount: 9, hskLevel: 1, frequencyRank: 2,
    exampleWords: [
      { word: '是不是', pinyin: 'shì bu shì', meaning: 'is or is not' },
      { word: '可是', pinyin: 'kě shì', meaning: 'but; however' }
    ],
    exampleSentences: [
      { sentence: '他是我的好朋友。', pinyin: 'Tā shì wǒ de hǎo péngyou.', meaning: 'He is my good friend.' }
    ]
  },
  '有': {
    character: '有', simplified: '有', traditional: '有', pinyin: 'yǒu',
    englishMeaning: 'to have; to possess; there is', persianMeaning: '',
    radicals: ['月'], strokeCount: 6, hskLevel: 1, frequencyRank: 5,
    exampleWords: [
      { word: '没有', pinyin: 'méi yǒu', meaning: 'not have; there is not' },
      { word: '有些', pinyin: 'yǒu xiē', meaning: 'some; somewhat' }
    ],
    exampleSentences: [
      { sentence: '我有一只可爱的猫。', pinyin: 'Wǒ yǒu yī zhī kě’ài de māo.', meaning: 'I have a cute cat.' }
    ]
  },
  '不': {
    character: '不', simplified: '不', traditional: '不', pinyin: 'bù',
    englishMeaning: 'no; not; non-; negative prefix', persianMeaning: '',
    radicals: ['一'], strokeCount: 4, hskLevel: 1, frequencyRank: 3,
    exampleWords: [
      { word: '不用', pinyin: 'bù yòng', meaning: 'no need' },
      { word: '不要', pinyin: 'bù yào', meaning: 'do not want' }
    ],
    exampleSentences: [
      { sentence: '我不想吃苹果。', pinyin: 'Wǒ bù xiǎng chī píngguǒ.', meaning: 'I do not want to eat an apple.' }
    ]
  }
};

function lowercaseAllPinyinInResponse(res: DictionaryApiResponse): DictionaryApiResponse {
  if (!res) return res;
  const result = { ...res };
  if (result.pinyin) {
    result.pinyin = result.pinyin.toLowerCase();
  }
  if (result.exampleWords) {
    result.exampleWords = result.exampleWords.map(w => ({
      ...w,
      pinyin: w.pinyin ? w.pinyin.toLowerCase() : ""
    }));
  }
  if (result.exampleSentences) {
    result.exampleSentences = result.exampleSentences.map(s => ({
      ...s,
      pinyin: s.pinyin ? s.pinyin.toLowerCase() : ""
    }));
  }
  return result;
}

// A real dictionary entry always describes *what the character/word means* —
// it never just names or re-describes the character itself. The old fallback
// path produced exactly that kind of non-answer (`Chinese character "X".`),
// which is what this validator exists to catch and reject, whether it comes
// from that removed fallback or, defensively, from a degenerate AI response.
function toDisplayString(value: unknown): string {
  if (Array.isArray(value)) return value.map((v) => String(v)).join('; ');
  if (value === null || value === undefined) return '';
  return String(value);
}

function isGenericOrInvalidMeaning(meaning: string, char: string): boolean {
  const trimmed = meaning.trim();
  if (!trimmed) return true;
  const lower = trimmed.toLowerCase();
  if (lower.includes('chinese character') || lower.includes('chinese word')) return true;
  // Catches "X" / '"X".' / a bare restatement of the character with only
  // punctuation around it — never an actual gloss.
  const strippedOfCharAndPunctuation = trimmed
    .replace(new RegExp(char, 'g'), '')
    .replace(/["'“”‘’.,!?()\s]/g, '');
  if (!strippedOfCharAndPunctuation) return true;
  if (lower === 'unknown' || lower === 'n/a' || lower === 'none') return true;
  return false;
}

function isUsablePinyin(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0 && value.trim().toLowerCase() !== 'unknown';
}

/**
 * Automatically fetch real Chinese character information using the Sino3D Intelligence System (AI Engine).
 * Uses a local high-quality cache first, then a validated live AI dictionary lookup (with one
 * corrective retry). Never fabricates a placeholder definition — if neither source produces a
 * genuine, validated translation, this throws rather than returning fake data.
 */
export async function parseHanziWithSino3D(char: string): Promise<DictionaryApiResponse> {
  const cleanChar = char.trim().charAt(0);
  if (!cleanChar) {
    throw new Error("Invalid character provided.");
  }

  // Strictly validate that it's a Chinese character
  const isChineseChar = /[\u4e00-\u9fa5]/.test(cleanChar);
  if (!isChineseChar) {
    throw new Error("Character information could not be found.");
  }

  // 1. Check local quick cache first (Guarantees real lookup instantly for popular ones)
  if (LOCAL_FALLBACK_DICT[cleanChar]) {
    return lowercaseAllPinyinInResponse({ ...LOCAL_FALLBACK_DICT[cleanChar] });
  }

  const ai = getQwenClient();
  if (ai) {
    const basePrompt = `Analyze the single Chinese Hanzi character: "${cleanChar}".
Provide its simplified representation, traditional representation, correct Pinyin with tone marks, English meaning, dictionary radicals, total stroke count, standard HSK level (1 to 6/9), frequency rank, 2 common example words using this character with pinyin and meaning, and 1-2 example sentences with pinyin and meaning.

The "englishMeaning" field is the most important field and MUST be a genuine dictionary definition — the actual meaning(s) of the character, the way a real Chinese-English dictionary (e.g. CC-CEDICT, Pleco) would define it. Follow these rules strictly:
- NEVER write a description like 'Chinese character "${cleanChar}"' or any variation that just names/labels the character instead of defining it — that is not a translation and is treated as an invalid answer.
- If the character has multiple distinct senses, list them all, separated by commas or semicolons (e.g. "comfortable, relaxed, at ease; to stretch/unfold, to open up"). Prioritize the meaning(s) most commonly used in real, everyday vocabulary and compound words over rare or archaic senses.
- Where useful, briefly note the part of speech or usage context in parentheses (e.g. "(adj.) comfortable, at ease; (v.) to stretch out, unfold").
- Base this strictly on authentic dictionary knowledge. Do not invent or guess a meaning — if you are not confident of the real meaning, still give the best-attested standard dictionary sense, never a placeholder or restatement of the character.
Be extremely accurate and return authentic dictionary values only. Do not hallucinate or return generic "yi" or "xin" pinyin. Leave 'persianMeaning' as an empty string.

Respond with ONLY a single JSON object, no surrounding text, matching exactly this shape:
{
  "character": string, "simplified": string, "traditional": string, "pinyin": string,
  "englishMeaning": string, "persianMeaning": "", "radicals": string[], "strokeCount": number,
  "hskLevel": number, "frequencyRank": number,
  "exampleWords": [{ "word": string, "pinyin": string, "meaning": string }],
  "exampleSentences": [{ "sentence": string, "pinyin": string, "meaning": string }]
}`;

    // Ask twice at most before giving up: audio-free JSON-mode text calls are
    // otherwise reliable, so a first-attempt validation failure is usually a
    // one-off degenerate response rather than a systemic problem — a single
    // corrective retry (with the failure named explicitly) resolves most of
    // those without resorting to a fake/placeholder answer.
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        const prompt =
          attempt === 1
            ? basePrompt
            : `${basePrompt}\n\nYour previous answer's "englishMeaning" was rejected for being empty, generic, or just a restatement of the character rather than an actual definition. Provide the real dictionary meaning(s) of "${cleanChar}" this time — do not repeat the same mistake.`;

        const response = await ai.chat.completions.create({
          model: 'qwen-plus',
          messages: [
            { role: 'system', content: 'You are an expert, world-class academic Chinese-English lexicographer and dictionary compiler.' },
            { role: 'user', content: prompt },
          ],
          response_format: { type: 'json_object' },
        });

        const text = response.choices[0]?.message?.content;
        if (!text) continue;

        const result: DictionaryApiResponse = extractJsonObject(text);
        if (!result) continue;
        if (!isUsablePinyin(result.pinyin)) continue;
        const meaning = toDisplayString(result.englishMeaning);
        if (isGenericOrInvalidMeaning(meaning, cleanChar)) continue;

        result.englishMeaning = meaning;
        result.persianMeaning = ""; // strictly empty
        return lowercaseAllPinyinInResponse(result);
      } catch (err) {
        console.error(`Sino3D AI Engine live parser failed for ${cleanChar} (attempt ${attempt}):`, err);
      }
    }
  }

  // 2. Neither the local cache nor a validated AI dictionary lookup produced
  // a real definition. Earlier this synthesized a fake entry from pinyin-pro
  // alone (fabricated stroke count, a made-up example word, and an
  // englishMeaning that just re-described the character — the exact
  // hallucination this function must never produce). Surfacing an honest
  // "try again" error is strictly better than saving a plausible-looking but
  // wrong translation into the learner's deck.
  throw new Error(
    ai
      ? 'Could not retrieve a reliable translation for this character right now. Please try again in a moment.'
      : 'The AI dictionary lookup is not configured on this server yet, and this character is not in the offline dictionary. Please try again later.'
  );
}
