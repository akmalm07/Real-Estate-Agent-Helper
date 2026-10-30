import { Link } from 'react-router-dom'

export default function PrivacyPolicyPage() {
  return (
    <div className="legal-page">
      <header className="legal-masthead"><Link to="/" className="account-wordmark">RealCRM</Link><span className="utility-label">Learn / Legal</span></header>
      <main className="legal-reading" aria-labelledby="privacy-title">
        <h1 id="privacy-title">Privacy Policy</h1>
        <p className="mb-4">
          Your privacy is important to us. This Privacy Policy explains how we collect, use, disclose, and safeguard your information when you visit our website [Your Website URL], including any other media form, media channel, mobile website, or mobile application related or connected thereto. Please read this Privacy Policy carefully. If you do not agree with the terms of this privacy policy, please do not access the site.
        </p>

        <h2>1. Information We Collect</h2>
        <p className="mb-4">
          We may collect information about you in a variety of ways. The information we may collect on the Site includes:
        </p>
        <ul className="list-disc list-inside ml-4 mb-4">
          <li>
            <strong>Personal Data:</strong> Personally identifiable information, such as your name, shipping address, email address, and telephone number, and demographic information, such as your age, gender, hometown, and interests, that you voluntarily give to us when you register with the Site or when you choose to participate in various activities related to the Site.
          </li>
          <li>
            <strong>Derivative Data:</strong> Information our servers automatically collect when you access the Site, such as your IP address, your browser type, your operating system, your access times, and the pages you have viewed directly before and after accessing the Site.
          </li>
        </ul>

        <h2>2. How We Use Your Information</h2>
        <p className="mb-4">
          Having accurate information about you permits us to provide you with a smooth, efficient, and customized experience. Specifically, we may use information collected about you via the Site to:
        </p>
        <ul className="list-disc list-inside ml-4 mb-4">
          <li>Create and manage your account.</li>
          <li>Deliver targeted advertising, coupons, newsletters, and other information regarding promotions and new products to you.</li>
          <li>Email you regarding your account or order.</li>
          <li>Enable user-to-user communications.</li>
          <li>Generate a personal profile about you to make your visit to the Site more personalized.</li>
        </ul>

        <h2>3. Disclosure of Your Information</h2>
        <p className="mb-4">
          We may share information we have collected about you in certain situations. Your information may be disclosed as follows:
        </p>
        <ul className="list-disc list-inside ml-4 mb-4">
          <li>
            <strong>By Law or to Protect Rights:</strong> If we believe the release of information about you is necessary to respond to legal process, to investigate or remedy potential violations of our policies, or to protect the rights, property, and safety of others, we may share your information as permitted or required by any applicable law, rule, or regulation.
          </li>
        </ul>
        <p className="mt-8 border-t border-border pt-4">
          <Link to="/" className="journal-text-link">Go back to Home</Link>
        </p>
      </main>
    </div>
  )
}
