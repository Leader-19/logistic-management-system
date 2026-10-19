export default function DashboardFooter() {
  return (
    <footer className="app-footer">
      <div className="footer-left">
        <span className="footer-brand">© {new Date().getFullYear()} LMS Portal</span>
        <span className="footer-sep" aria-hidden="true">·</span>
        <span className="footer-credit">Developed by <strong>DIN Leader</strong></span>
      </div>
      <span className="system-status"><i /> All systems operational</span>
    </footer>
  );
}
