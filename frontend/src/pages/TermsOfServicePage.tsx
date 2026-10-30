import { Link } from 'react-router-dom'

export default function TermsOfServicePage() {
  return (
    <div className="legal-page">
      <header className="legal-masthead"><Link to="/" className="account-wordmark">RealCRM</Link><span className="utility-label">Learn / Legal</span></header>
      <main className="legal-reading" aria-labelledby="terms-title">
        <h1 id="terms-title">Terms of Service</h1>
        <p className="mb-4">
          Welcome to our service. By accessing or using our website and services, you agree to comply with and be bound by the following terms and conditions of use. Please review these terms carefully. If you do not agree to these terms, you should not use this website.
        </p>

        <h2>1. Acceptance of Terms</h2>
        <p className="mb-4">
          This Agreement constitutes the entire and only agreement between us and you, and supersedes all prior or contemporaneous agreements, representations, warranties and understandings with respect to the Site, the content, products or services provided by or through the Site, and the subject matter of this Agreement. This Agreement may be amended at any time by us from time to time without specific notice to you. The latest Agreement will be posted on the Site, and you should review this Agreement prior to using the Site.
        </p>

        <h2>2. Use of Service</h2>
        <p className="mb-4">
          You agree to use our services only for lawful purposes and in a way that does not infringe the rights of, restrict or inhibit anyone else's use and enjoyment of the service. Prohibited behavior includes harassing or causing distress or inconvenience to any other user, transmitting obscene or offensive content or disrupting the normal flow of dialogue within our services.
        </p>

        <h2>3. Intellectual Property</h2>
        <p className="mb-4">
          The content, organization, graphics, design, compilation, magnetic translation, digital conversion and other matters related to the Site are protected under applicable copyrights, trademarks and other proprietary (including but not limited to intellectual property) rights. The copying, redistribution, use or publication by you of any such matters or any part of the Site, except as allowed by Section 4, is strictly prohibited. You do not acquire ownership rights to any content, document or other materials viewed through the Site.
        </p>

        <h2>4. Disclaimers</h2>
        <p className="mb-4">
          The information on this site is provided "as is" and without warranties of any kind, either expressed or implied. To the fullest extent permissible pursuant to applicable law, we disclaim all warranties, express or implied, including, but not limited to, implied warranties of merchantability and fitness for a particular purpose.
        </p>
        <p className="mt-8 border-t border-border pt-4">
          <Link to="/" className="journal-text-link">Go back to Home</Link>
        </p>
      </main>
    </div>
  )
}
