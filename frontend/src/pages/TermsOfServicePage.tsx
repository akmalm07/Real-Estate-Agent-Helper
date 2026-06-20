import React from 'react'
import { Link } from 'react-router-dom'

export default function TermsOfServicePage() {
  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center py-12 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto bg-white p-8 rounded-lg shadow-md">
        <h1 className="text-3xl font-extrabold text-gray-900 mb-6">Terms of Service</h1>
        <p className="mb-4 text-gray-700">
          Welcome to our service. By accessing or using our website and services, you agree to comply with and be bound by the following terms and conditions of use. Please review these terms carefully. If you do not agree to these terms, you should not use this website.
        </p>

        <h2 className="text-2xl font-bold text-gray-800 mb-4">1. Acceptance of Terms</h2>
        <p className="mb-4 text-gray-700">
          This Agreement constitutes the entire and only agreement between us and you, and supersedes all prior or contemporaneous agreements, representations, warranties and understandings with respect to the Site, the content, products or services provided by or through the Site, and the subject matter of this Agreement. This Agreement may be amended at any time by us from time to time without specific notice to you. The latest Agreement will be posted on the Site, and you should review this Agreement prior to using the Site.
        </p>

        <h2 className="text-2xl font-bold text-gray-800 mb-4">2. Use of Service</h2>
        <p className="mb-4 text-gray-700">
          You agree to use our services only for lawful purposes and in a way that does not infringe the rights of, restrict or inhibit anyone else's use and enjoyment of the service. Prohibited behavior includes harassing or causing distress or inconvenience to any other user, transmitting obscene or offensive content or disrupting the normal flow of dialogue within our services.
        </p>

        <h2 className="text-2xl font-bold text-gray-800 mb-4">3. Intellectual Property</h2>
        <p className="mb-4 text-gray-700">
          The content, organization, graphics, design, compilation, magnetic translation, digital conversion and other matters related to the Site are protected under applicable copyrights, trademarks and other proprietary (including but not limited to intellectual property) rights. The copying, redistribution, use or publication by you of any such matters or any part of the Site, except as allowed by Section 4, is strictly prohibited. You do not acquire ownership rights to any content, document or other materials viewed through the Site.
        </p>

        <h2 className="2xl font-bold text-gray-800 mb-4">4. Disclaimers</h2>
        <p className="mb-4 text-gray-700">
          The information on this site is provided "as is" and without warranties of any kind, either expressed or implied. To the fullest extent permissible pursuant to applicable law, we disclaim all warranties, express or implied, including, but not limited to, implied warranties of merchantability and fitness for a particular purpose.
        </p>
        <p className="mt-8 text-center text-gray-500">
          <Link to="/" className="text-indigo-600 hover:underline">Go back to Home</Link>
        </p>
      </div>
    </div>
  )
}
