// LINE message templates (기획서 §5).
const RESULT_URL = "https://sumuadi.github.io/result.html";

function formatDateJP(iso: string | null): string {
  if (!iso) return "指定日";
  const d = new Date(iso);
  return `${d.getMonth() + 1}月${d.getDate()}日`;
}

export function winnerAnnounceTemplate(displayName: string, submitDeadline: string | null): string {
  const deadline = formatDateJP(submitDeadline);
  return `🎉ご当選おめでとうございます！🎉

SUMUADIガチャイベントにご応募いただき、
誠にありがとうございます。

厳正なる抽選の結果、${displayName}様が当選されました！

▼賞品の受け取りには下記のご提出が必要です
①番号カードの写真
②配送先情報

下記リンクより${deadline}までにご入力ください。
${RESULT_URL}

※番号カードの確認ができない場合、または期限までに
ご入力がない場合は、当選が無効となりますのでご注意ください。
※本人確認のため、追加の写真提出をお願いする場合があります。`;
}

export function shippingReceivedTemplate(params: {
  name: string;
  postalCode: string;
  prefecture: string;
  city: string;
  addressLine: string;
  building?: string | null;
}): string {
  return `✅配送先情報を受け付けました

${params.name}様
配送先のご入力ありがとうございます。

【お届け先】
〒${params.postalCode}
${params.prefecture}${params.city}${params.addressLine} ${params.building || ""}
${params.name} 様

賞品は韓国よりEMS（国際スピード郵便）にて
発送いたします。発送まで数日ほどお時間を
いただく場合がございます。

内容に誤りがある場合は、下記リンクより
再度ご修正ください。
${RESULT_URL}`;
}

export function announceBroadcastTemplate(): string {
  return `📢当選発表のお知らせ📢

SUMUADI POP-UPガチャイベントの
当選発表を開始いたしました！

下記リンクよりLINEログインの上、
結果をご確認ください。
${RESULT_URL}`;
}

export function shippedTemplate(name: string, trackingNumber: string): string {
  return `📦賞品を発送いたしました

${name}様の賞品をEMSにて発送いたしました。
追跡番号：${trackingNumber}
追跡はこちら → https://trackings.post.japanpost.jp/

お届けまで今しばらくお待ちください。`;
}
