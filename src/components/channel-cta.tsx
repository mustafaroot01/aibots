import { Telegram } from "./icons";

/** دعوة بارزة لمتابعة القناة — تظهر بالرئيسية وصفحة الوظيفة */
export function ChannelCta({
  channel, siteName, variant = "full",
}: { channel: string; siteName: string; variant?: "full" | "slim" }) {
  if (!channel) return null;
  const href = `https://t.me/${channel}`;

  if (variant === "slim") {
    return (
      <a className="cta-slim" href={href} target="_blank" rel="noopener">
        <span className="cta-icon"><Telegram /></span>
        <span className="cta-text">
          <b>تابعنا على تلجرام</b>
          <small>كل وظيفة جديدة توصلك أول بأول</small>
        </span>
        <span className="cta-go">@{channel}</span>
      </a>
    );
  }

  return (
    <a className="cta-card" href={href} target="_blank" rel="noopener">
      <span className="cta-glow" aria-hidden />
      <span className="cta-icon big"><Telegram /></span>
      <span className="cta-body">
        <b>انضم لقناة {siteName} على تلجرام</b>
        <small>وصّلك إشعار بكل وظيفة جديدة لحظة نشرها — بدون ما تفتح الموقع</small>
      </span>
      <span className="cta-btn">
        <Telegram /> اشترك الآن
      </span>
    </a>
  );
}
