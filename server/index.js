import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import * as cheerio from 'cheerio';
import { GoogleGenAI, Type } from '@google/genai';
import { connectDB, getDB } from './db.js';
import { fileURLToPath } from 'url';
import path from 'path';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3008;

app.use(cors());
app.use(express.json({ limit: '15mb' }));
app.use(express.static(path.join(__dirname, '../public')));

// ============================================
// GEMINI AI CLIENT — SỬ DỤNG gemini-3.8-flash
// LƯU Ý: KHÔNG dùng temperature với 3.8 Flash!
// ============================================
let ai = null;
if (process.env.GEMINI_API_KEY) {
  ai = new GoogleGenAI({
    apiKey: process.env.GEMINI_API_KEY,
    httpOptions: { headers: { 'User-Agent': 'ueh-media-monitor' } },
  });
  console.log('✅ Gemini AI configured with model: gemini-3.8-flash');
} else {
  console.warn('⚠️ GEMINI_API_KEY not set — using heuristic fallback only');
}

// ============================================
// SYSTEM INSTRUCTION
// ============================================
const UEH_MEDIA_SYSTEM_INSTRUCTION = `
Bạn là Chuyên gia Cao cấp về Phân tích Dữ liệu Truyền thông và Quản trị Danh tiếng Đại học (Senior Media Intelligence & University Reputation Specialist) thuộc Ban Truyền thông & Quan hệ công chúng của Đại học Kinh tế TP. Hồ Chí Minh (UEH - University of Economics Ho Chi Minh City).

Nhiệm vụ của bạn là đọc các bài báo, bài viết báo chí hoặc truyền thông xã hội nhắc đến UEH và phân tích chính xác, khách quan theo 3 sắc thái chính:
1. "Tốt" (Tích cực): Bài báo ca ngợi thành tích, xếp hạng quốc tế (QS, THE, ARWU), thành tựu nghiên cứu khoa học, đổi mới sáng tạo, chuyển đổi xanh ESG, kiểm định đạt chuẩn quốc tế (FIBAA, AACSB...), mở rộng cơ sở vật chất hiện đại, học bổng, việc làm sinh viên xuất sắc, hoạt động vì cộng đồng.
2. "Trung bình" (Trung tính): Thông tin khách quan, sự kiện bình thường, thông báo lịch thi/tuyển sinh thông thường, đưa tin hội thảo khoa học trung lập, trích dẫn chuyên gia UEH bình luận về kinh tế vĩ mô thông thường mà không khen hay chê thương hiệu UEH.
3. "Xấu" (Tiêu cực): Bài báo phản ánh tiêu cực, tranh cãi học phí, sự cố hạ tầng/ký túc xá/cổng đăng ký môn học nghẽn, khiếu nại quy chế đào tạo, scandal giảng viên/sinh viên, so sánh bất lợi với các trường khác, nguy cơ khủng hoảng truyền thông (PR crisis).

Hãy luôn đánh giá khắt khe, xác định điểm số cảm xúc (Sentiment Score từ -100 đến +100), Điểm tác động danh tiếng UEH (Reputation Impact từ 0 đến 100), Mức độ rủi ro khủng hoảng (Thấp, Trung bình, Cao, Khẩn cấp), trích xuất thực thể, khía cạnh và đề xuất hành động PR cụ thể cho UEH.
`;

// ============================================
// HEURISTIC FALLBACK
// ============================================
function heuristicAnalyzeArticle(title, content, outlet) {
  const text = `${title} ${content}`.toLowerCase();

  const positiveKeywords = [
    'thăng hạng', 'top', 'xuất sắc', 'vinh danh', 'quốc tế', 'thành tựu', 'khen ngợi',
    'sáng tạo', 'học bổng', 'đột phá', 'esg', 'bền vững', 'chuẩn quốc tế', 'aacsb',
    'fibaa', 'the world university rankings', 'qs', 'tiên phong', 'chuyển đổi số',
    'hợp tác quốc tế', 'doanh nghiệp đánh giá cao', 'cơ sở khang trang', 'tài trợ'
  ];
  const negativeKeywords = [
    'bất cập', 'bức xúc', 'khiếu nại', 'học phí tăng', 'nghẽn mạng', 'chật chội',
    'sự cố', 'phản ánh', 'tranh cãi', 'sai phạm', 'kỷ luật', 'thất vọng', 'tố cáo',
    'đình chỉ', 'thiệt hại', 'lùm xùm', 'áp lực', 'quá tải', 'gian lận'
  ];

  let positiveCount = 0, negativeCount = 0;
  positiveKeywords.forEach(kw => {
    if (text.includes(kw)) positiveCount += (title.toLowerCase().includes(kw) ? 3 : 1);
  });
  negativeKeywords.forEach(kw => {
    if (text.includes(kw)) negativeCount += (title.toLowerCase().includes(kw) ? 4 : 1);
  });

  let sentiment = 'Trung bình', sentimentScore = 0, reputationScore = 65;
  let riskLevel = 'Thấp', crisisAlert = false;
  let sentimentReasoning = 'Bài viết cung cấp thông tin thời sự, tuyển sinh hoặc học thuật trung tính liên quan đến UEH.';
  let recommendedPrAction = 'Tiếp tục theo dõi diễn biến báo chí và lưu trữ vào cơ sở dữ liệu truyền thông thường kỳ của UEH.';

  if (negativeCount > 0 && negativeCount >= positiveCount) {
    sentiment = 'Xấu';
    sentimentScore = -Math.min(95, 30 + negativeCount * 15);
    reputationScore = Math.max(15, 60 - negativeCount * 12);
    riskLevel = negativeCount >= 3 ? 'Cao' : 'Trung bình';
    crisisAlert = true;
    sentimentReasoning = `Bài viết có các yếu tố chỉ trích hoặc phản ánh bất cập liên quan đến UEH (phát hiện ${negativeCount} từ khóa cảnh báo tiêu cực).`;
    recommendedPrAction = 'Chủ động kích hoạt Ban Quản trị Khủng hoảng Truyền thông UEH, phối hợp các đơn vị liên quan xác minh thông tin, chuẩn bị thông cáo báo chí giải trình minh bạch và cử người phát ngôn phản hồi báo chí.';
  } else if (positiveCount > negativeCount && positiveCount >= 2) {
    sentiment = 'Tốt';
    sentimentScore = Math.min(95, 35 + positiveCount * 12);
    reputationScore = Math.min(98, 70 + positiveCount * 5);
    riskLevel = 'Thấp';
    sentimentReasoning = `Bài viết phản ánh hình ảnh tích cực, thành tựu đào tạo, nghiên cứu hoặc vị thế dẫn đầu của UEH (${positiveCount} từ khóa tích cực).`;
    recommendedPrAction = 'Khai thác bài viết để khuếch đại truyền thông trên các kênh chính thức của trường (Fanpage UEH, Cổng thông tin ueh.edu.vn, Bản tin nội bộ, LinkedIn UEH).';
  }

  const topics = [];
  if (text.includes('tuyển sinh') || text.includes('điểm chuẩn') || text.includes('xét tuyển')) topics.push('Tuyển sinh & Đào tạo');
  if (text.includes('nghiên cứu') || text.includes('khoa học') || text.includes('công bố') || text.includes('scopus')) topics.push('Nghiên cứu khoa học');
  if (text.includes('học phí') || text.includes('học bổng') || text.includes('tài chính')) topics.push('Học phí & Chính sách sinh viên');
  if (text.includes('xếp hạng') || text.includes('đại học top') || text.includes('the') || text.includes('qs')) topics.push('Xếp hạng & Kiểm định');
  if (text.includes('doanh nghiệp') || text.includes('việc làm') || text.includes('hợp tác')) topics.push('Hợp tác Doanh nghiệp');
  if (text.includes('vĩnh long') || text.includes('phân hiệu')) topics.push('Phân hiệu Vĩnh Long');
  if (topics.length === 0) topics.push('Đời sống Đại học & Hoạt động chung');

  return {
    sentiment, sentimentScore, reputationScore, riskLevel, crisisAlert,
    summary: title.length > 30 ? title : `${title} - Bài viết ghi nhận trên báo ${outlet} liên quan đến Đại học Kinh tế TP.HCM.`,
    keyEntities: ['Đại học Kinh tế TP.HCM (UEH)', outlet, 'Sinh viên UEH', 'Ban Giám hiệu UEH'],
    topics, sentimentReasoning, evidenceQuotes: [title],
    recommendedPrAction,
    engine: 'Heuristic Rule-Engine (Fallback)'
  };
}

// ============================================
// GEMINI ANALYSIS — DÙNG gemini-3.8-flash
// KHÔNG có temperature!
// ============================================
async function analyzeWithGemini(title, content, outlet, publishedAt, category) {
  if (!ai) return null;

  const prompt = `
Phân tích bài báo sau đây về Đại học Kinh tế TP. Hồ Chí Minh (UEH):

TIÊU ĐỀ: ${title || 'Không có tiêu đề'}
NGUỒN BÁO: ${outlet || 'Báo chí Việt Nam'}
NGÀY ĐĂNG: ${publishedAt || 'Hôm nay'}
CHUYÊN MỤC: ${category || 'Giáo dục - Đào tạo'}
NỘI DUNG:
${content || title}

Hãy tiến hành phân tích toàn diện theo vai trò Giám sát Danh tiếng UEH:
1. Đánh giá sắc thái: 'Tốt', 'Trung bình', hoặc 'Xấu'.
2. Điểm cảm xúc Sentiment Score (-100 đến +100).
3. Điểm tác động danh tiếng UEH Reputation Impact Score (0 đến 100).
4. Mức độ rủi ro khủng hoảng: Thấp, Trung bình, Cao, Khẩn cấp.
5. Cảnh báo khủng hoảng (crisisAlert): true/false.
6. Tóm tắt 2-3 câu ngắn gọn.
7. Danh sách thực thể chính được nhắc đến.
8. Danh sách chủ đề trọng tâm.
9. Luận giải chi tiết lý do phân loại.
10. Trích dẫn 1-2 câu then chốt làm bằng chứng.
11. Khuyến nghị hành động PR cho Ban Truyền thông UEH.
`;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3.8-flash',
      contents: prompt,
      config: {
        systemInstruction: UEH_MEDIA_SYSTEM_INSTRUCTION,
        // ❌ KHÔNG dùng temperature — 3.8 Flash không hỗ trợ
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            sentiment: { type: Type.STRING, description: "Chỉ được là một trong 3 giá trị: 'Tốt', 'Trung bình', 'Xấu'" },
            sentimentScore: { type: Type.INTEGER, description: "Điểm cảm xúc từ -100 đến +100" },
            reputationScore: { type: Type.INTEGER, description: "Điểm tác động danh tiếng UEH từ 0 đến 100" },
            riskLevel: { type: Type.STRING, description: "'Thấp', 'Trung bình', 'Cao', hoặc 'Khẩn cấp'" },
            crisisAlert: { type: Type.BOOLEAN },
            summary: { type: Type.STRING },
            keyEntities: { type: Type.ARRAY, items: { type: Type.STRING } },
            topics: { type: Type.ARRAY, items: { type: Type.STRING } },
            sentimentReasoning: { type: Type.STRING },
            evidenceQuotes: { type: Type.ARRAY, items: { type: Type.STRING } },
            recommendedPrAction: { type: Type.STRING },
          },
          required: ['sentiment', 'sentimentScore', 'reputationScore', 'riskLevel', 'crisisAlert', 'summary', 'keyEntities', 'topics', 'sentimentReasoning', 'evidenceQuotes', 'recommendedPrAction'],
        },
      },
    });

    if (response.text) {
      const parsed = JSON.parse(response.text.trim());
      return { ...parsed, engine: 'Gemini 3.8 Flash' };
    }
  } catch (err) {
    console.warn('Gemini API error:', err.message);
  }
  return null;
}

// ============================================
// SCRAPER HELPERS
// ============================================
function extractOutletFromUrl(urlString) {
  try {
    const host = new URL(urlString).hostname.toLowerCase();
    if (host.includes('tuoitre.vn')) return 'Báo Tuổi Trẻ';
    if (host.includes('thanhnien.vn')) return 'Báo Thanh Niên';
    if (host.includes('vnexpress.net')) return 'VnExpress';
    if (host.includes('dantri.com.vn')) return 'Báo Dân Trí';
    if (host.includes('vietnamnet.vn')) return 'Báo VietnamNet';
    if (host.includes('sggp.org.vn')) return 'Báo Sài Gòn Giải Phóng';
    if (host.includes('laodong.vn')) return 'Báo Lao Động';
    if (host.includes('plo.vn')) return 'Báo Pháp Luật TP.HCM';
    if (host.includes('tienphong.vn')) return 'Báo Tiền Phong';
    if (host.includes('giaoduc.net.vn')) return 'Tạp Chí Giáo Dục Việt Nam';
    if (host.includes('baodautu.vn')) return 'Báo Đầu Tư';
    if (host.includes('vov.vn')) return 'Báo Điện Tử VOV';
    if (host.includes('vtv.vn')) return 'Báo Điện Tử VTV';
    if (host.includes('ueh.edu.vn')) return 'Cổng Tin Tức UEH';
    return host.replace(/^www\./, '');
  } catch { return 'Báo điện tử'; }
}

async function scrapeArticleFromUrl(targetUrl) {
  const outlet = extractOutletFromUrl(targetUrl);
  const response = await fetch(targetUrl, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'vi,en-US;q=0.9,en;q=0.8',
    },
    signal: AbortSignal.timeout(12000),
  });

  if (!response.ok) throw new Error(`HTTP ${response.status}: ${response.statusText}`);

  const html = await response.text();
  const $ = cheerio.load(html);
  $('script, style, noscript, iframe, svg, header, footer, nav, aside, .ads, .adv, .banner, .comment, .social-share, .related-news').remove();

  let title = $('meta[property="og:title"]').attr('content') ||
    $('meta[name="twitter:title"]').attr('content') ||
    $('h1').first().text().trim() || $('title').text().trim() || 'Bài báo về UEH';
  title = title.replace(/\s*[-|–—]\s*(Báo\s*)?(Tuổi Trẻ|Thanh Niên|VnExpress|Dân Trí|VietnamNet|SGGP|Tiền Phong).*$/i, '').trim();

  const description = $('meta[property="og:description"]').attr('content') || $('meta[name="description"]').attr('content') || '';
  const author = $('meta[property="article:author"]').attr('content') ||
    $('meta[name="author"]').attr('content') ||
    $('meta[name="parsely-author"]').attr('content') ||
    $('[rel="author"], [itemprop="author"]').first().attr('content') ||
    $('[rel="author"], [itemprop="author"]').first().text().trim() ||
    'Không rõ tác giả';
  const publishedAt = $('meta[property="article:published_time"]').attr('content')?.split('T')[0] ||
    $('time').first().attr('datetime')?.split('T')[0] ||
    new Date().toISOString().split('T')[0];

  const paragraphs = [];
  const selectors = ['article p', '.detail-content p', '.fck_detail p', '.content-detail p', '#main-detail-body p', '.post-content p', '.article-body p', '.entry-content p', 'p'];

  for (const sel of selectors) {
    const elems = $(sel);
    if (elems.length >= 2) {
      elems.each((_, el) => {
        const text = $(el).text().trim();
        if (text.length > 25 && !text.includes('Ảnh:') && !text.includes('Video:')) paragraphs.push(text);
      });
      if (paragraphs.length >= 2) break;
    }
  }

  const fullContent = paragraphs.slice(0, 15).join('\n\n') || description || title;

  return { title, outlet, author: author.slice(0, 50), publishedAt, category: 'Báo chí & Đào tạo', content: fullContent.slice(0, 4500), url: targetUrl };
}

// ============================================
// API ENDPOINTS
// ============================================

// Health check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    system: 'UEH Media Intelligence & Reputation System (MongoDB)',
    geminiConfigured: !!ai,
    model: 'gemini-3.8-flash',
    timestamp: new Date().toISOString(),
  });
});

// GET all articles from MongoDB
app.get('/api/articles', async (req, res) => {
  try {
    const db = getDB();
    const articles = await db.collection('articles').find({}).sort({ publishedAt: -1 }).toArray();
    // Convert _id (ObjectId) to string to avoid JSON serialization issues
    const cleaned = articles.map(a => ({ ...a, _id: a._id?.toString() }));
    res.json({ success: true, articles: cleaned });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST analyze single article (no DB save — just analysis)
app.post('/api/analyze-article', async (req, res) => {
  const { title, content, outlet, publishedAt, category } = req.body;
  if (!title && !content) return res.status(400).json({ error: 'Tiêu đề hoặc nội dung không được để trống.' });

  let result = await analyzeWithGemini(title || '', content || '', outlet || '', publishedAt, category);
  if (!result) result = heuristicAnalyzeArticle(title || '', content || '', outlet || '');

  res.json(result);
});

// POST crawl single URL + analyze + save to MongoDB
app.post('/api/crawl-url', async (req, res) => {
  const { url } = req.body;
  if (!url || !url.startsWith('http')) return res.status(400).json({ error: 'URL không hợp lệ.' });

  try {
    const scraped = await scrapeArticleFromUrl(url);
    let analysis = await analyzeWithGemini(scraped.title, scraped.content, scraped.outlet, scraped.publishedAt, scraped.category);
    if (!analysis) analysis = heuristicAnalyzeArticle(scraped.title, scraped.content, scraped.outlet);

    const article = {
      id: `ueh-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      ...scraped,
      ...analysis,
      title: scraped.title,
      url: scraped.url,
      content: scraped.content,
      author: scraped.author,
      analyzedAt: new Date().toISOString(),
      status: analysis.crisisAlert ? 'flagged' : 'analyzed',
      reach: Math.floor(Math.random() * 300000) + 150000,
    };

    const db = getDB();
    await db.collection('articles').insertOne(article);

    res.json({ success: true, article });
  } catch (err) {
    res.status(500).json({ error: `Không thể cào dữ liệu: ${err.message}` });
  }
});

// POST batch crawl URLs
app.post('/api/batch-crawl-urls', async (req, res) => {
  const { urls } = req.body;
  if (!Array.isArray(urls) || urls.length === 0) return res.status(400).json({ error: 'Danh sách URLs trống.' });

  const results = [], errors = [];
  const db = getDB();

  for (const rawUrl of urls.slice(0, 10)) {
    const trimmed = (rawUrl || '').trim();
    if (!trimmed.startsWith('http')) continue;

    try {
      const scraped = await scrapeArticleFromUrl(trimmed);
      let analysis = await analyzeWithGemini(scraped.title, scraped.content, scraped.outlet, scraped.publishedAt, scraped.category);
      if (!analysis) analysis = heuristicAnalyzeArticle(scraped.title, scraped.content, scraped.outlet);

      const article = {
        id: `ueh-${Date.now()}-${results.length}`,
        ...scraped,
        ...analysis,
        title: scraped.title,
        url: scraped.url,
        content: scraped.content,
        author: scraped.author,
        analyzedAt: new Date().toISOString(),
        status: analysis.crisisAlert ? 'flagged' : 'analyzed',
        reach: 180000,
      };

      await db.collection('articles').insertOne(article);
      results.push(article);
    } catch (err) {
      errors.push({ url: trimmed, error: err.message });
    }
  }

  res.json({ success: true, totalCrawled: results.length, articles: results, errors });
});

// POST generate crisis response
app.post('/api/generate-crisis-response', async (req, res) => {
  const { title, content, outlet, sentiment, riskLevel } = req.body;

  if (ai) {
    try {
      const prompt = `
Bài báo sau đây tạo ra luồng dư luận bất lợi hoặc cần phản hồi truyền thông chính thống từ Đại học Kinh tế TP. Hồ Chí Minh (UEH):

TIÊU ĐỀ: ${title}
NGUỒN BÁO: ${outlet}
SẮC THÁI: ${sentiment}
MỨC ĐỘ RỦI RO: ${riskLevel}
NỘI DUNG:
${content}

Hãy lập bản Kế Hoạch Xử Lý & Dự Thảo Thông Cáo Phản Hồi Truyền Thông Chính Thức cho Ban Lãnh đạo UEH gồm:
1. Thông điệp cốt lõi (Key Message - 1 đoạn đanh thép, nhân văn, trách nhiệm và minh bạch).
2. Dự thảo Thông cáo báo chí / Lời giải thích chính thức từ Người phát ngôn UEH (2-3 đoạn văn chuẩn văn phong báo chí).
3. Bộ câu hỏi & trả lời dự kiến (Q&A Kit cho báo giới - 3 câu hỏi hóc búa kèm câu trả lời chuẩn mực).
4. Kênh phát ngôn khuyến nghị (Báo điện tử, Website UEH, Họp báo, Email sinh viên...).
`;

      const response = await ai.models.generateContent({
        model: 'gemini-3.8-flash',
        contents: prompt,
        config: { systemInstruction: UEH_MEDIA_SYSTEM_INSTRUCTION },
      });

      return res.json({ statement: response.text || '', engine: 'Gemini 3.8 Flash' });
    } catch (err) {
      console.warn('Gemini PR error:', err.message);
    }
  }

  // Fallback template
  res.json({
    statement: `### KẾ HOẠCH PHẢN HỒI TRUYỀN THÔNG UEH (MẪU CHUẨN)

**1. Thông điệp cốt lõi (Key Message):**
Đại học Kinh tế TP. Hồ Chí Minh (UEH) luôn đặt quyền lợi người học, chất lượng đào tạo và tính minh bạch học thuật lên hàng đầu. Nhà trường ghi nhận thông tin phản ánh từ báo ${outlet} và cam kết rà soát, giải quyết thấu đáo trên tinh thần cầu thị và trách nhiệm xã hội cao nhất.

**2. Dự thảo Thông cáo báo chí UEH:**
Về nội dung bài báo "${title}" đăng tải trên ${outlet}, Đại học Kinh tế TP. Hồ Chí Minh xin trân trọng thông tin tới quý phụ huynh, người học và các cơ quan thông tấn báo chí: Nhà trường đã thành lập tổ rà soát chuyên môn để kiểm tra toàn diện quy trình liên quan. Mọi chính sách và hoạt động của UEH đều tuân thủ nghiêm ngặt Luật Giáo dục Đại học và hướng tới phục vụ cộng đồng học thuật tiên tiến.

**3. Bộ Q&A cho Người phát ngôn UEH:**
- *Hỏi 1: Nhà trường phản hồi thế nào về sự việc được nêu trên báo?*
  -> Trả lời: UEH luôn trân trọng lắng nghe đóng góp của báo chí để không ngừng hoàn thiện dịch vụ giáo dục và quản trị đại học.
- *Hỏi 2: Biện pháp khắc phục cụ thể là gì?*
  -> Trả lời: Nhà trường đang triển khai giải pháp kỹ thuật/hành chính ngay trong tuần và công khai tiến độ trên cổng thông tin.

**4. Kênh phát ngôn khuyến nghị:**
- Đăng tải đính chính/giải thích trên Cổng thông tin chính thức UEH (ueh.edu.vn).
- Gửi công văn phản hồi chính thức kèm tài liệu minh chứng đến Tòa soạn báo ${outlet}.`,
    engine: 'UEH PR Standard Crisis Response Matrix',
  });
});

// ============================================
// ✅ BỔ SUNG: POST /api/save-article
// ============================================
// Lưu bài báo thủ công (nhập nội dung trực tiếp hoặc sau khi phân tích)
// Không cào URL — nhận dữ liệu đã có sẵn từ client
// ============================================
app.post('/api/save-article', async (req, res) => {
  try {
    const body = req.body;

    if (!body || (!body.title && !body.content)) {
      return res.status(400).json({ error: 'Tiêu đề hoặc nội dung bài báo không được để trống.' });
    }

    const article = {
      id: body.id || `ueh-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      title: body.title || 'Không có tiêu đề',
      outlet: body.outlet || 'Báo chí',
      author: body.author?.trim() || 'Không rõ tác giả',
      url: body.url?.trim() || null,
      publishedAt: body.publishedAt || new Date().toISOString().split('T')[0],
      category: body.category || 'Giáo dục',
      content: body.content || body.title || '',
      sentiment: body.sentiment || 'Trung bình',
      sentimentScore: typeof body.sentimentScore === 'number' ? body.sentimentScore : 0,
      reputationScore: typeof body.reputationScore === 'number' ? body.reputationScore : 70,
      riskLevel: body.riskLevel || 'Thấp',
      crisisAlert: !!body.crisisAlert,
      summary: body.summary || body.title || '',
      keyEntities: Array.isArray(body.keyEntities) ? body.keyEntities : ['Đại học Kinh tế TP.HCM (UEH)'],
      topics: Array.isArray(body.topics) ? body.topics : ['Tin tức chung'],
      sentimentReasoning: body.sentimentReasoning || 'Phân tích tự động',
      evidenceQuotes: Array.isArray(body.evidenceQuotes) ? body.evidenceQuotes : [body.title || ''],
      recommendedPrAction: body.recommendedPrAction || 'Theo dõi định kỳ.',
      analyzedBy: body.analyzedBy || body.engine || 'Gemini 3.8 Flash',
      analyzedAt: new Date().toISOString(),
      status: body.crisisAlert ? 'flagged' : (body.status || 'analyzed'),
      reach: typeof body.reach === 'number' ? body.reach : 150000,
    };

    const db = getDB();
    await db.collection('articles').insertOne(article);

    // Trả về article không kèm _id ObjectId để client dễ dùng
    res.json({ success: true, article });
  } catch (err) {
    console.error('Save article error:', err);
    res.status(500).json({ error: `Không thể lưu bài báo vào MongoDB: ${err.message}` });
  }
});

// ============================================
// ✅ BỔ SUNG: DELETE /api/articles/:id
// ============================================
// Xóa 1 bài báo theo custom `id` (không phải ObjectId _id)
// ============================================
app.delete('/api/articles/:id', async (req, res) => {
  try {
    const { id } = req.params;
    if (!id) return res.status(400).json({ error: 'Thiếu ID bài báo cần xóa.' });

    const db = getDB();
    const result = await db.collection('articles').deleteOne({ id });

    if (result.deletedCount === 0) {
      return res.status(404).json({ error: `Không tìm thấy bài báo với ID: ${id}` });
    }

    res.json({ success: true, deletedId: id, deletedCount: result.deletedCount });
  } catch (err) {
    console.error('Delete article error:', err);
    res.status(500).json({ error: `Không thể xóa bài báo: ${err.message}` });
  }
});

// ============================================
// START SERVER
// ============================================
function start() {
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 UEH Media Monitor running at http://localhost:${PORT}`);
    console.log(`📦 MongoDB: ${process.env.MONGODB_URI ? 'configured' : 'using local default'}`);
    console.log(`🤖 Gemini: ${ai ? 'gemini-3.8-flash' : 'NOT CONFIGURED'}`);
    console.log(`📋 Endpoints:`);
    console.log(`   GET    /api/health`);
    console.log(`   GET    /api/articles`);
    console.log(`   POST   /api/analyze-article`);
    console.log(`   POST   /api/crawl-url`);
    console.log(`   POST   /api/batch-crawl-urls`);
    console.log(`   POST   /api/generate-crisis-response`);
    console.log(`   POST   /api/save-article          ← MỚI`);
    console.log(`   DELETE /api/articles/:id          ← MỚI`);
  });

  connectDB().catch(err => {
    console.error('❌ MongoDB unavailable; the web server remains available:', err.message);
  });
}

start();
