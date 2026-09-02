export default function Loading() {
  return (
    <div style={{ paddingTop: 26 }}>
      <div className="sk" style={{ height: 26, width: "48%", marginBottom: 10 }} />
      <div className="sk" style={{ height: 16, width: "72%", marginBottom: 22 }} />
      <div className="sk" style={{ height: 50, borderRadius: 999, marginBottom: 18 }} />
      <div className="cards">
        {Array.from({ length: 6 }).map((_, i) => (
          <div className="skeleton" key={i}>
            <div style={{ display: "flex", gap: 12 }}>
              <div className="sk" style={{ width: 44, height: 44, borderRadius: 13, flex: "none" }} />
              <div style={{ flex: 1 }}>
                <div className="sk" style={{ height: 15, width: "70%", marginBottom: 8 }} />
                <div className="sk" style={{ height: 12, width: "40%" }} />
              </div>
            </div>
            <div className="sk" style={{ height: 12, marginTop: 14 }} />
            <div className="sk" style={{ height: 12, width: "80%", marginTop: 7 }} />
            <div style={{ display: "flex", gap: 6, marginTop: 14 }}>
              <div className="sk" style={{ height: 26, width: 90, borderRadius: 8 }} />
              <div className="sk" style={{ height: 26, width: 70, borderRadius: 8 }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
