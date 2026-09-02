"use client";

/** زر يطلب تأكيد قبل ما ينفّذ إجراء خطر */
export function ConfirmButton({
  children, message, className = "mini", style,
}: {
  children: React.ReactNode;
  message: string;
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <button
      type="submit"
      className={className}
      style={style}
      onClick={(e) => {
        if (!window.confirm(message)) e.preventDefault();
      }}
    >
      {children}
    </button>
  );
}
