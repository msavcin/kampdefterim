/**
 * AI Review Evaluation API
 * 
 * Kamp alanları için Google Places yorumlarını AI ile değerlendirme
 * - owner_id boş olan alanları kontrol eder
 * - 6 aylık cooldown kontrol eder
 * - Google Places API'den yorumları çeker
 * - AI ile değerlendirir
 * - Sonuçları veritabanına kaydeder
 */

import { apiFetch } from './apiFetch';
import { getRatingsForCampground, getRatingsSummary } from './ratingApi';
import { getGooglePlaceDetails } from './googlePlacesApi';

export interface CampingAreaReviewEvaluation {
  campground_id: number;
  ai_review_evaluation: string;
  ai_review_generated_at: string;
  google_place_id?: string;
  updated_fields?: {
    rating?: number;
    review_count?: number;
    facilities?: string[];
    price_range?: string;
    website?: string;
    phone?: string;
  };
}

export interface ParsedAIReview {
  summary: string;
  pros: string[];
  cons: string[];
  raw: string;
}

export interface ReviewInsightSource {
  rating?: number | string | null;
  comment?: string | null;
  text?: string | null;
  review_text?: string | null;
  review?: string | null;
}

export interface ReviewInsightBuildOptions {
  campgroundName?: string | null;
  reviewCount?: number | null;
  averageRating?: number | null;
  googlePlaceId?: string | null;
}

const GENERIC_AI_REVIEW_PATTERNS = [
  /detayl[ıi]\s+bilgi\s+i[cç]in\s+google\s+places/i,
  /bu\s+kamp\s+alan[ıi]\s+hakk[ıi]nda(?:\s+google\s+places\s+(?:üzerinde|[üu]zerinde))?\s+[\w\s]+\s+kullan[ıi]c[ıi]\s+yorumu\s+bulunmaktad[ıi]r/i,
  /google\s+places\s+(?:üzerinde|[üu]zerinde|['’]te).*kullan[ıi]c[ıi]\s+yorumu\s+bulunmaktad[ıi]r/i,
];

const REVIEW_POSITIVE_WORDS = [
  'güzel', 'guzel', 'harika', 'mükemmel', 'mukemmel', 'iyi', 'temiz', 'sakin',
  'huzurlu', 'ilgili', 'yardımcı', 'yardimci', 'beğendik', 'begendik', 'memnun',
  'tavsiye', 'öneririm', 'oneririm', 'uygun', 'ferah', 'keyifli', 'rahat', 'başarılı', 'basarili'
];

const REVIEW_NEGATIVE_WORDS = [
  'kötü', 'kotu', 'pis', 'kirli', 'pahalı', 'pahali', 'kalabalık', 'kalabalik',
  'gürültü', 'gurultu', 'yetersiz', 'sorun', 'problem', 'bozuk', 'ilgisiz',
  'zor', 'eksik', 'çöp', 'cop', 'rahatsız', 'rahatsiz', 'şikayet', 'sikayet',
  'beğenmedik', 'begenmedik', 'berbat', 'rezalet'
];

const REVIEW_TOPIC_RULES = [
  {
    key: 'location',
    label: 'konum ve ulaşım',
    keywords: ['konum', 'lokasyon', 'ulaşım', 'ulasim', 'yol', 'yakın', 'yakin', 'merkez'],
    pro: 'Konum, yakınlık veya ulaşım yorumlarda olumlu öne çıkıyor.',
    con: 'Konum, yol veya ulaşım tarafında dikkat edilmesi gereken yorumlar var.',
    mixed: 'Konum ve ulaşım konusunda hem memnuniyet hem de dikkat edilmesi gereken deneyimler aktarılmış.',
  },
  {
    key: 'cleanliness',
    label: 'temizlik ve hijyen',
    keywords: ['temiz', 'temizlik', 'hijyen', 'pis', 'kirli', 'çöp', 'cop'],
    pro: 'Temizlik ve düzen konusunda olumlu geri bildirimler bulunuyor.',
    con: 'Temizlik, hijyen veya çevre düzeniyle ilgili olumsuz geri bildirimler var.',
    mixed: 'Temizlik ve hijyen algısı yorumlara göre değişiyor; bazı kullanıcılar memnunken bazıları bakım beklentisini vurgulamış.',
  },
  {
    key: 'facilities',
    label: 'tesis olanakları',
    keywords: ['tuvalet', 'wc', 'duş', 'dus', 'banyo', 'elektrik', 'su', 'tesis', 'olanak', 'imkan', 'imkân'],
    pro: 'Tuvalet, duş, su/elektrik gibi tesis olanakları bazı yorumlarda artı olarak belirtiliyor.',
    con: 'Tuvalet, duş, su/elektrik veya tesis altyapısı konusunda eksiklerden söz ediliyor.',
    mixed: 'Tesis olanakları konusunda yorumlar karışık; bazı kullanıcılar imkanları yeterli bulurken bazıları altyapı ve bakım tarafında eksik belirtmiş.',
  },
  {
    key: 'staff',
    label: 'işletme ve personel',
    keywords: ['personel', 'işletme', 'isletme', 'çalışan', 'calisan', 'sahip', 'ilgi', 'ilgili', 'yardımcı', 'yardimci'],
    pro: 'İşletme veya personel ilgisi olumlu yorumlanan başlıklar arasında.',
    con: 'İşletme/personel iletişimi veya hizmet yaklaşımıyla ilgili olumsuz deneyimler aktarılmış.',
    mixed: 'İşletme ve personel deneyimi yorumlarda tek yönlü değil; olumlu iletişim kadar bazı olumsuz temaslar da aktarılmış.',
  },
  {
    key: 'atmosphere',
    label: 'sakinlik ve atmosfer',
    keywords: ['sakin', 'sessiz', 'huzur', 'huzurlu', 'kalabalık', 'kalabalik', 'gürültü', 'gurultu', 'müzik', 'muzik'],
    pro: 'Sakinlik ve huzurlu atmosfer olumlu yön olarak öne çıkıyor.',
    con: 'Kalabalık, gürültü veya sakinlik beklentisiyle ilgili uyarılar var.',
    mixed: 'Atmosfer ve sakinlik beklentisi kullanıcıya göre değişiyor; bazı yorumlar huzuru, bazıları kalabalık/gürültü ihtimalini vurguluyor.',
  },
  {
    key: 'price',
    label: 'fiyat ve performans',
    keywords: ['fiyat', 'ücret', 'ucret', 'pahalı', 'pahali', 'ucuz', 'uygun', 'performans'],
    pro: 'Fiyat/performans algısı bazı yorumlarda olumlu değerlendiriliyor.',
    con: 'Fiyat, ücret veya alınan hizmetin karşılığı konusunda eleştiriler var.',
    mixed: 'Fiyat/performans algısı yorumlarda karışık; bazı kullanıcılar makul bulurken bazıları ücret-hizmet dengesini sorgulamış.',
  },
  {
    key: 'nature',
    label: 'doğal çevre ve manzara',
    keywords: ['manzara', 'deniz', 'sahil', 'plaj', 'göl', 'gol', 'orman', 'doğa', 'doga', 'çevre', 'cevre'],
    pro: 'Doğal çevre, manzara veya deniz/sahil yakınlığı olumlu şekilde anılıyor.',
    con: 'Çevre koşulları, doğal alan kullanımı veya bakım konusunda olumsuz notlar var.',
    mixed: 'Doğal çevre ve manzara güçlü bir unsur olsa da çevre bakımı konusunda farklı deneyimler aktarılmış.',
  },
  {
    key: 'safety_family',
    label: 'güvenlik ve aile uygunluğu',
    keywords: ['güvenli', 'guvenli', 'güvenlik', 'guvenlik', 'aile', 'çocuk', 'cocuk'],
    pro: 'Güvenlik veya aileye uygunluk açısından olumlu yorumlar bulunuyor.',
    con: 'Güvenlik, aile/çocuk uygunluğu veya alan düzeniyle ilgili çekinceler belirtilmiş.',
    mixed: 'Güvenlik ve aile uygunluğu konusunda yorumlar sınırlı veya karışık; beklentiye göre önceden bilgi almak faydalı olabilir.',
  },
];

function normalizeReviewText(value: unknown): string {
  return typeof value === 'string'
    ? value.trim().replace(/\s+/g, ' ')
    : '';
}

function extractReviewComment(item: ReviewInsightSource): string {
  return normalizeReviewText(
    item.comment ?? item.text ?? item.review_text ?? item.review ?? ''
  );
}

function hasAnyWord(text: string, words: string[]): boolean {
  return words.some((word) => text.includes(word));
}

function uniqueNonEmpty(items: string[], limit: number): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const item of items) {
    const clean = item.trim();
    if (!clean) continue;
    const key = clean.toLocaleLowerCase('tr-TR');
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(clean);
    if (result.length >= limit) break;
  }
  return result;
}

function extractReviewCountFromText(text: string): number | null {
  const match = text.match(/(\d+)\s+kullan[ıi]c[ıi]\s+yorumu/i);
  if (!match) return null;
  const value = Number(match[1]);
  return Number.isFinite(value) ? value : null;
}

export function isGenericAIReviewText(text: string | null | undefined): boolean {
  const raw = typeof text === 'string' ? text.trim() : '';
  if (!raw) return false;

  const hasProsCons = /(?:^|\n)\s*(Artılar|Avantajlar)\s*:/i.test(raw) ||
    /(?:^|\n)\s*(Eksiler|Dezavantajlar)\s*:/i.test(raw);

  const isGeneric = GENERIC_AI_REVIEW_PATTERNS.some((pattern) => pattern.test(raw));

  // AI gerçekten artı/eksi üretmişse sadece Google Places notu geçti diye generic sayma.
  return isGeneric && !hasProsCons;
}

function resolveReviewTopics(
  topicScores: Array<{ rule: any; pro: number; con: number }>,
): { pros: string[]; cons: string[]; mixed: string[] } {
  const pros: string[] = [];
  const cons: string[] = [];
  const mixed: string[] = [];

  topicScores.forEach((topic) => {
    const pro = topic.pro || 0;
    const con = topic.con || 0;
    if (pro <= 0 && con <= 0) return;

    // Aynı başlığı hem artıya hem eksiye yazma. Dengeli/karışık durumları
    // madde listesine değil değerlendirme paragrafına taşı.
    if (pro > 0 && con > 0) {
      if (pro >= con + 2) {
        pros.push(topic.rule.pro);
      } else if (con >= pro + 2) {
        cons.push(topic.rule.con);
      } else {
        mixed.push(
          topic.rule.mixed ||
            `${topic.rule.label || 'Bazı başlıklar'} için yorumlar karışık; deneyim kullanıcı beklentisine göre değişebilir.`,
        );
      }
      return;
    }

    if (pro > 0) pros.push(topic.rule.pro);
    if (con > 0) cons.push(topic.rule.con);
  });

  return {
    pros: uniqueNonEmpty(pros, 5),
    cons: uniqueNonEmpty(cons, 5),
    mixed: uniqueNonEmpty(mixed, 3),
  };
}

function buildNarrativeReview(
  campgroundName: string | null | undefined,
  reviewCount: number,
  averageRating: number | null,
  pros: string[],
  cons: string[],
  mixed: string[],
  commentCount: number,
): string {
  const areaName = campgroundName || 'Bu kamp alanı';
  const countLabel = reviewCount > 0 ? `${reviewCount} yorum` : 'mevcut yorumlar';
  const ratingSentence = typeof averageRating === 'number'
    ? ` İncelenen yorumlarda puan ortalaması yaklaşık ${averageRating.toFixed(1)}/5 seviyesinde.`
    : '';

  const positiveSentence = pros.length > 0
    ? ` Olumlu tarafta ${pros.slice(0, 3).map((item) => item.replace(/\.$/, '').toLocaleLowerCase('tr-TR')).join(', ')} gibi noktalar öne çıkıyor.`
    : ' Olumlu yönler yorumlarda belirgin bir başlık altında yoğunlaşmıyor.';

  const cautionSentence = cons.length > 0
    ? ` Dikkat edilmesi gereken taraflarda ise ${cons.slice(0, 3).map((item) => item.replace(/\.$/, '').toLocaleLowerCase('tr-TR')).join(', ')} başlıkları görülüyor.`
    : ' Tekrar eden güçlü bir olumsuz başlık öne çıkmadığı için genel izlenim daha dengeli görünüyor.';

  const mixedSentence = mixed.length > 0
    ? ` Bazı konularda yorumlar karışık: ${mixed.map((item) => item.replace(/\.$/, '').toLocaleLowerCase('tr-TR')).join('; ')}. Bu nedenle bu başlıklar artı/eksi listelerinde tekrar edilmeden genel değerlendirmede tutuldu.`
    : '';

  const firstParagraph = `${areaName} için kullanıcı yorumları incelendiğinde ${countLabel} içinde kamp deneyimini etkileyen başlıklar daha çok konfor, hizmet, çevre koşulları ve beklenti yönetimi etrafında toplanıyor.${ratingSentence}${positiveSentence}`;
  const secondParagraph = `${cautionSentence}${mixedSentence ? ` ${mixedSentence}` : ''} Bu nedenle alanı değerlendiren kampçıların, özellikle kendi önceliklerine göre yorumlardaki bu ayrımları dikkate alması faydalı olur.`;
  const thirdParagraph = commentCount > 0
    ? 'Genel tablo, kısa ziyaret veya konaklama planlayan kullanıcılar için güçlü yanların yanında kontrol edilmesi gereken birkaç pratik nokta olduğunu gösteriyor.'
    : 'Ayrıntılı yorum metni sınırlı olduğu için değerlendirme temkinli tutulmuştur.';

  return [firstParagraph, secondParagraph, thirdParagraph].join('\n\n');
}

function parseAIReviewBulletsForConflict(text: string): { pros: string[]; cons: string[] } {
  const raw = typeof text === 'string' ? text : '';
  const prosMatch = raw.match(/(?:Artılar|Avantajlar)\s*:\s*([\s\S]*?)(?=(?:\n\s*(?:Eksiler|Dezavantajlar)\s*:)|$)/i);
  const consMatch = raw.match(/(?:Eksiler|Dezavantajlar)\s*:\s*([\s\S]*?)(?=(?:\n\s*(?:Not|Sonuç)\s*:)|$)/i);
  const parseBullets = (block?: string): string[] => !block ? [] : block
    .split(/\r?\n/)
    .map((line) => normalizeReviewText(line).replace(/^[\-\*•\s\d\.]+/, '').trim())
    .filter(Boolean);

  return {
    pros: parseBullets(prosMatch?.[1]),
    cons: parseBullets(consMatch?.[1]),
  };
}

function getBulletTopicKeys(bullet: string): string[] {
  const lower = normalizeReviewText(bullet).toLocaleLowerCase('tr-TR');
  return REVIEW_TOPIC_RULES
    .map((rule: any, index: number) => ({ key: rule.key || rule.label || String(index), rule }))
    .filter(({ rule }) => hasAnyWord(lower, rule.keywords))
    .map(({ key }) => key);
}

function removeContradictoryParsedBullets(pros: string[], cons: string[]): { pros: string[]; cons: string[] } {
  const conTopics = new Set(cons.flatMap(getBulletTopicKeys));
  const proTopics = new Set(pros.flatMap(getBulletTopicKeys));

  // Eski kayıtlarda aynı başlık iki listede varsa, çelişkiyi ekranda göstermemek için
  // tekrar eden başlığı artılar listesinden kaldırıyoruz; nüans ana paragrafta kalır.
  const cleanPros = pros.filter((item) => !getBulletTopicKeys(item).some((key) => conTopics.has(key)));
  const cleanCons = cons.filter((item) => !getBulletTopicKeys(item).some((key) => proTopics.has(key) && cleanPros.some((p) => getBulletTopicKeys(p).includes(key))));

  return {
    pros: cleanPros,
    cons: cleanCons,
  };
}

export function buildReviewEvaluationFromComments(
  reviews: ReviewInsightSource[] = [],
  options: ReviewInsightBuildOptions = {}
): string {
  const normalizedReviews = (Array.isArray(reviews) ? reviews : [])
    .map((item) => {
      const comment = extractReviewComment(item);
      const rawRating = item?.rating != null ? Number(item.rating) : null;
      return {
        comment,
        rating: rawRating != null && Number.isFinite(rawRating) ? rawRating : undefined,
      };
    })
    .filter((item) => item.comment.length > 0 || typeof item.rating === 'number');

  const commentReviews = normalizedReviews.filter((item) => item.comment.length > 0);
  const reviewCount =
    typeof options.reviewCount === 'number' && Number.isFinite(options.reviewCount)
      ? options.reviewCount
      : normalizedReviews.length;
  const averageRating =
    typeof options.averageRating === 'number' && Number.isFinite(options.averageRating)
      ? options.averageRating
      : (() => {
          const rated = normalizedReviews.filter((item) => typeof item.rating === 'number');
          if (rated.length === 0) return null;
          return rated.reduce((sum, item) => sum + Number(item.rating), 0) / rated.length;
        })();

  const topicScores = REVIEW_TOPIC_RULES.map((rule) => ({ rule, pro: 0, con: 0 }));
  let positiveGeneral = 0;
  let negativeGeneral = 0;

  commentReviews.forEach((item) => {
    const text = item.comment.toLocaleLowerCase('tr-TR');
    const rating = item.rating;
    const explicitPositive = hasAnyWord(text, REVIEW_POSITIVE_WORDS);
    const explicitNegative = hasAnyWord(text, REVIEW_NEGATIVE_WORDS);
    const positive = (typeof rating === 'number' && rating >= 4) || (explicitPositive && !explicitNegative);
    const negative = (typeof rating === 'number' && rating <= 2) || (explicitNegative && !explicitPositive);

    let matchedTopic = false;
    topicScores.forEach((topic) => {
      if (!hasAnyWord(text, topic.rule.keywords)) return;
      matchedTopic = true;
      if (positive) topic.pro += 1;
      if (negative) topic.con += 1;
      if (!positive && !negative) {
        if (explicitPositive) topic.pro += 1;
        if (explicitNegative) topic.con += 1;
      }
    });

    if (!matchedTopic) {
      if (positive) positiveGeneral += 1;
      if (negative) negativeGeneral += 1;
    }
  });

  const resolved = resolveReviewTopics(topicScores);
  const pros = [...resolved.pros];
  const cons = [...resolved.cons];
  const mixed = [...resolved.mixed];

  if (positiveGeneral > 0) {
    pros.push('Yorumların bir bölümünde genel memnuniyet ve tavsiye etme eğilimi görülüyor.');
  }
  if (negativeGeneral > 0) {
    cons.push('Bazı yorumlarda genel memnuniyetsizlik veya beklentinin karşılanmaması dikkat çekiyor.');
  }

  if (pros.length === 0) {
    if (typeof averageRating === 'number' && averageRating >= 4) {
      pros.push('Genel puan ortalaması olumlu görünüyor; kullanıcı deneyimi ağırlıklı olarak memnuniyet yönünde.');
    } else if (commentReviews.length > 0) {
      pros.push('Yorumlarda belirgin bir olumlu tema ayrışmıyor; detaylar kullanıcı yorumları arttıkça netleşecektir.');
    } else {
      pros.push('Olumlu yönleri güvenilir biçimde çıkarmak için yeterli yorum metni bulunmuyor.');
    }
  }

  if (cons.length === 0) {
    if (typeof averageRating === 'number' && averageRating < 3.5) {
      cons.push('Genel puan ortalaması karışık; yorum metinleri arttıkça olumsuz başlıklar daha net ayrışacaktır.');
    } else if (commentReviews.length > 0) {
      cons.push('Yorumlarda tekrar eden belirgin bir olumsuz başlık öne çıkmıyor.');
    } else {
      cons.push('Olumsuz yönleri güvenilir biçimde çıkarmak için yeterli yorum metni bulunmuyor.');
    }
  }

  const finalPros = uniqueNonEmpty(pros, 5);
  const finalCons = uniqueNonEmpty(cons, 5);
  const narrative = buildNarrativeReview(
    options.campgroundName,
    reviewCount,
    averageRating,
    finalPros,
    finalCons,
    mixed,
    commentReviews.length,
  );

  return [
    narrative,
    '',
    'Artılar:',
    ...finalPros.map((item) => `- ${item}`),
    '',
    'Eksiler:',
    ...finalCons.map((item) => `- ${item}`),
    '',
    `Not: Bu değerlendirme kullanıcı yorumlarının metinlerinden çıkarılmıştır${commentReviews.length > 0 ? ` (${commentReviews.length} yorum metni analiz edildi)` : ''}.`,
  ].join('\n');
}

export async function buildReviewEvaluationFallbackForCampground(
  campgroundId: number | string,
  options: ReviewInsightBuildOptions = {}
): Promise<string> {
  let reviews: ReviewInsightSource[] = [];
  let reviewCount = options.reviewCount ?? null;
  let averageRating = options.averageRating ?? null;

  // Öncelik Google Places yorum metinlerinde. Backend AI generic sayım metni döndürürse
  // burada Place Details üzerinden gerçek yorum örneklerini alıp artı/eksi çıkarıyoruz.
  if (options.googlePlaceId) {
    try {
      const placeDetails = await getGooglePlaceDetails(options.googlePlaceId);
      if (placeDetails) {
        if (reviewCount == null) {
          reviewCount = placeDetails.user_ratings_total ?? null;
        }
        if (averageRating == null) {
          averageRating = typeof placeDetails.rating === 'number' ? placeDetails.rating : null;
        }
        if (Array.isArray(placeDetails.reviews) && placeDetails.reviews.length > 0) {
          reviews = placeDetails.reviews.map((review) => ({
            rating: review.rating,
            comment: review.text,
          }));
        }
      }
    } catch (error) {
      if (__DEV__) console.warn('[AIReview] Google Places yorumları alınamadı, lokal yorumlar deneniyor:', error);
    }
  }

  try {
    const ratingsData: any = await getRatingsForCampground(campgroundId, {
      page: 1,
      per_page: 50,
      sort: 'newest',
      comments_only: true,
      include_aggregate: true,
      include_user: false,
    });

    const localReviews = Array.isArray(ratingsData?.items)
      ? ratingsData.items
      : Array.isArray(ratingsData?.rows)
        ? ratingsData.rows
        : Array.isArray(ratingsData)
          ? ratingsData
          : [];
    reviews = reviews.length > 0 ? [...reviews, ...localReviews] : localReviews;

    const aggregate = ratingsData?.aggregate;
    if (reviewCount == null) {
      reviewCount = aggregate?.review_count ?? aggregate?.total_count ?? aggregate?.count ?? null;
    }
    if (averageRating == null) {
      const rawRating = aggregate?.rating ?? aggregate?.average_rating ?? aggregate?.avg_rating ?? null;
      const parsedRating = rawRating != null ? Number(rawRating) : null;
      averageRating = parsedRating != null && Number.isFinite(parsedRating) ? parsedRating : null;
    }
  } catch (error) {
    if (__DEV__) console.warn('[AIReview] Yorum metinleri alınamadı, summary deneniyor:', error);
  }

  if (reviewCount == null || averageRating == null) {
    try {
      const summary: any = await getRatingsSummary(campgroundId);
      if (reviewCount == null) reviewCount = summary?.total_count ?? summary?.count ?? summary?.review_count ?? null;
      if (averageRating == null) {
        const rawRating = summary?.average_rating ?? summary?.avg_rating ?? summary?.rating ?? null;
        const parsedRating = rawRating != null ? Number(rawRating) : null;
        averageRating = parsedRating != null && Number.isFinite(parsedRating) ? parsedRating : null;
      }
    } catch (error) {
      if (__DEV__) console.warn('[AIReview] Rating summary alınamadı:', error);
    }
  }

  return buildReviewEvaluationFromComments(reviews, {
    ...options,
    reviewCount: reviewCount ?? options.reviewCount ?? null,
    averageRating: averageRating ?? options.averageRating ?? null,
  });
}

async function ensureEvaluationHasActionableReviewText(
  campgroundId: number | string,
  evaluation: CampingAreaReviewEvaluation | null | undefined,
  options: ReviewInsightBuildOptions = {}
): Promise<CampingAreaReviewEvaluation | undefined> {
  if (!evaluation) return undefined;

  const currentText = evaluation.ai_review_evaluation ?? '';
  if (!isGenericAIReviewText(currentText)) return evaluation;

  const fallbackText = await buildReviewEvaluationFallbackForCampground(campgroundId, {
    ...options,
    reviewCount:
      options.reviewCount ??
      evaluation.updated_fields?.review_count ??
      extractReviewCountFromText(currentText),
    averageRating:
      options.averageRating ??
      evaluation.updated_fields?.rating ??
      null,
    googlePlaceId:
      options.googlePlaceId ??
      evaluation.google_place_id ??
      null,
  });

  return {
    ...evaluation,
    ai_review_evaluation: fallbackText,
  };
}

/**
 * Basit bir parser: `ai_review_evaluation` metnini ayırır.
 * Beklenen format: kısa özet, sonra "Artılar:" ve "Eksiler:" başlıkları altında madde listeleri.
 */
export function parseAIReviewText(text: string | null | undefined): ParsedAIReview {
  const initialRaw = typeof text === 'string' ? text.trim() : '';
  const raw = isGenericAIReviewText(initialRaw)
    ? buildReviewEvaluationFromComments([], {
        reviewCount: extractReviewCountFromText(initialRaw),
      })
    : initialRaw;

  // Bölümleri yakalamaya çalış
  const artilarMatch = raw.match(/(?:Artılar|Avantajlar)\s*:\s*([\s\S]*?)(?=(?:\n(?:Eksiler|Dezavantajlar)\s*:)|$)/i);
  const eksilerMatch = raw.match(/(?:Eksiler|Dezavantajlar)\s*:\s*([\s\S]*?)(?=(?:\n(?:Not:|Not)|$))/i);

  // Özet: ilk başlıktan önceki metin
  let summary = raw;
  const firstHeadingIndex = raw.search(/(?:Artılar|Avantajlar|Eksiler|Dezavantajlar)\s*:/i);
  if (firstHeadingIndex !== -1) {
    summary = raw.slice(0, firstHeadingIndex).trim();
  }

  const parseBullets = (block: string | undefined): string[] => {
    if (!block) return [];
    return block
      .split(/\r?\n/) // satırlara böl
      .map(l => l.trim())
      .filter(l => l.length > 0)
      .map(l => l.replace(/^[\-\*•\s\d\.]+/, '').trim())
      .filter(l => l.length > 0);
  };

  const parsedPros = parseBullets(artilarMatch ? artilarMatch[1] : undefined);
  const parsedCons = parseBullets(eksilerMatch ? eksilerMatch[1] : undefined);
  const { pros, cons } = removeContradictoryParsedBullets(parsedPros, parsedCons);

  return {
    summary: summary || '',
    pros,
    cons,
    raw
  };
}

export interface EvaluateReviewsRequest {
  campground_id?: number; // Belirli bir alan için
  force?: boolean; // Cooldown'u bypass et (sadece superadmin)
}

export interface EvaluateReviewsResponse {
  success: boolean;
  evaluation?: CampingAreaReviewEvaluation;
  error?: string;
  cooldown_remaining?: number; // Saniye cinsinden kalan süre
}

export interface BatchEvaluateResponse {
  success: boolean;
  processed: number;
  failed: number;
  skipped: number;
  results: Array<{
    campground_id: number;
    success: boolean;
    error?: string;
  }>;
}

/**
 * Belirli bir kamp alanı için AI review değerlendirmesi yapar
 */
export async function evaluateCampingAreaReviews(
  campgroundId: number,
  force: boolean = false
): Promise<EvaluateReviewsResponse> {
  try {
    const response = await apiFetch('/camping-areas/evaluate-reviews', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        campground_id: campgroundId,
        force
      })
    });

    // Önce response durumunu kontrol et
    if (!response.ok) {
      // Hata durumunda response body'yi oku (JSON veya text)
      let errorMessage = 'Değerlendirme yapılamadı';
      let cooldownRemaining: string | undefined;
      
      try {
        const contentType = response.headers.get('content-type');
        if (contentType?.includes('application/json')) {
          const data = await response.json();
          errorMessage = data.error || errorMessage;
          cooldownRemaining = data.cooldown_remaining;
        } else {
          const text = await response.text();
          errorMessage = text || `HTTP ${response.status}`;
          if (__DEV__) console.warn('[AIReview] Non-JSON error response:', text);
        }
      } catch (parseError) {
        if (__DEV__) console.warn('[AIReview] Error parsing response:', parseError);
        errorMessage = `HTTP ${response.status}`;
      }

      return {
        success: false,
        error: errorMessage,
        cooldown_remaining: cooldownRemaining ? Number(cooldownRemaining) : undefined
      };
    }

    // Başarılı durumda JSON parse et
    const data = await response.json();
    const evaluation = await ensureEvaluationHasActionableReviewText(
      campgroundId,
      data.evaluation
    );
    return {
      success: true,
      evaluation
    };
  } catch (error) {
    console.error('[AIReview] evaluateCampingAreaReviews hatası:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Bilinmeyen hata'
    };
  }
}

/**
 * owner_id boş olan tüm kamp alanları için toplu değerlendirme yapar
 * Günlük limiti kontrol eder, 6 aylık cooldown'u dikkate alır
 */
export async function batchEvaluateCampingAreaReviews(
  options?: {
    limit?: number; // Kaç alan işlenecek (default: günlük limit)
    force?: boolean; // Cooldown'u bypass et
  }
): Promise<BatchEvaluateResponse> {
  try {
    const response = await apiFetch('/camping-areas/batch-evaluate-reviews', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(options || {})
    });

    // Önce response durumunu kontrol et
    if (!response.ok) {
      let errorMessage = 'Toplu değerlendirme başarısız';
      
      try {
        const contentType = response.headers.get('content-type');
        if (contentType?.includes('application/json')) {
          const data = await response.json();
          errorMessage = data.error || errorMessage;
        } else {
          const text = await response.text();
          errorMessage = text || `HTTP ${response.status}`;
          if (__DEV__) console.warn('[AIReview] Non-JSON batch error response:', text);
        }
      } catch (parseError) {
        if (__DEV__) console.warn('[AIReview] Error parsing batch response:', parseError);
        errorMessage = `HTTP ${response.status}`;
      }

      console.error('[AIReview] Batch evaluation failed:', errorMessage);
      return {
        success: false,
        processed: 0,
        failed: 0,
        skipped: 0,
        results: []
      };
    }

    // Başarılı durumda JSON parse et
    const data = await response.json();
    return data;
  } catch (error) {
    console.error('[AIReview] batchEvaluateCampingAreaReviews hatası:', error);
    return {
      success: false,
      processed: 0,
      failed: 0,
      skipped: 0,
      results: []
    };
  }
}

/**
 * Bir kamp alanının AI review değerlendirmesini getirir
 */
export async function getCampingAreaAIReview(
  campgroundId: number
): Promise<CampingAreaReviewEvaluation | null> {
  try {
    const response = await apiFetch(`/camping-areas/${campgroundId}/ai-review`, {
      method: 'GET'
    });

    if (!response.ok) {
      if (response.status === 404) return null;
      
      // Hata durumunda detaylı log
      const bodyText = await response.text().catch(() => null);
      if (__DEV__) console.warn(`[AIReview] getCampingAreaAIReview HTTP ${response.status}:`, bodyText || response.statusText);
      return null;
    }

    const data = await response.json();
    const review = data.review || null;
    if (!review) return null;
    return (await ensureEvaluationHasActionableReviewText(campgroundId, review)) || null;
  } catch (error) {
    console.error('[AIReview] getCampingAreaAIReview hatası:', error);
    return null;
  }
}

/**
 * Sunucudan AI review çekip `parseAIReviewText` ile ayrıştırılmış sonucu döndürür.
 */
export async function getParsedCampingAreaAIReview(
  campgroundId: number
): Promise<ParsedAIReview | null> {
  const review = await getCampingAreaAIReview(campgroundId);
  if (!review) return null;
  return parseAIReviewText(review.ai_review_evaluation);
}

/**
 * Değerlendirmeye uygun kamp alanlarını listeler
 * (owner_id boş ve 6 ay geçmiş olanlar)
 */
export async function getEligibleCampingAreasForReview(): Promise<Array<{
  id: number;
  name: string;
  booking_url?: string;
  last_evaluated?: string;
}>> {
  try {
    const response = await apiFetch('/camping-areas/eligible-for-review', {
      method: 'GET'
    });

    if (!response.ok) {
      const bodyText = await response.text().catch(() => null);
      console.error(`[AIReview] eligible-for-review HTTP ${response.status}:`, bodyText || response.statusText);
      throw new Error(`HTTP ${response.status}: ${bodyText || response.statusText}`);
    }

    const data = await response.json();
    return data.areas || [];
  } catch (error) {
    console.error('[AIReview] getEligibleCampingAreasForReview hatası:', error);
    return [];
  }
}

/**
 * Bir kamp alanının AI review değerlendirmesini siler
 * (Sadece superadmin, hatalı değerlendirmeleri temizlemek için)
 */
export async function deleteCampingAreaAIReview(
  campgroundId: number
): Promise<boolean> {
  try {
    const response = await apiFetch(`/camping-areas/${campgroundId}/ai-review`, {
      method: 'DELETE'
    });

    return response.ok;
  } catch (error) {
    console.error('[AIReview] deleteCampingAreaAIReview hatası:', error);
    return false;
  }
}

/**
 * Bir kamp alanı için AI review'u manuel olarak aktif/pasif yapar
 */
export async function toggleCampingAreaAIReview(
  campgroundId: number,
  enabled: boolean
): Promise<boolean> {
  try {
    const response = await apiFetch(`/camping-areas/${campgroundId}/ai-review-toggle`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled })
    });

    return response.ok;
  } catch (error) {
    console.error('[AIReview] toggleCampingAreaAIReview hatası:', error);
    return false;
  }
}
