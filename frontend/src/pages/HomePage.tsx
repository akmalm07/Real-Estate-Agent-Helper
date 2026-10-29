import { Link } from 'react-router-dom'
import { Button } from '../components/ui/Button'
import { Card } from '../components/ui/Card'
import { Sparkles, ShieldCheck, FileText } from 'lucide-react'

export default function HomePage() {
  return (
    <div className="min-h-screen bg-gray-50 flex flex-col justify-center items-center py-12 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto text-center">
        <Sparkles className="mx-auto h-16 w-16 text-indigo-600" />
        <h1 className="mt-4 text-4xl font-extrabold text-gray-900 sm:text-5xl sm:tracking-tight lg:text-6xl">
          Welcome to Your AI-Powered Platform
        </h1>
        <p className="mt-6 text-xl text-gray-500">
          Streamline your workflow, manage leads, and automate your communication with intelligent tools designed for real estate professionals.
        </p>
        <div className="mt-10 flex flex-col sm:flex-row justify-center gap-4">
          <Button variant="primary" size="lg" className="px-8 py-3">
            <Link to="/login">Get Started</Link>
          </Button>
          <Button variant="secondary" size="lg" className="px-8 py-3">
            <Link to="/signup">Learn More</Link>
          </Button>
        </div>
      </div>

      <div className="mt-20 w-full max-w-6xl grid grid-cols-1 md:grid-cols-3 gap-8 px-4">
        <Card className="flex flex-col items-center p-6 text-center">
          <ShieldCheck className="h-10 w-10 text-green-500 mb-4" />
          <h3 className="text-xl font-semibold text-gray-900 mb-2">Secure & Reliable</h3>
          <p className="text-gray-600">
            Your data is protected with industry-leading security measures. Trust in a platform built for stability.
          </p>
        </Card>
        <Card className="flex flex-col items-center p-6 text-center">
          <Sparkles className="h-10 w-10 text-indigo-500 mb-4" />
          <h3 className="text-xl font-semibold text-gray-900 mb-2">Smart Automation</h3>
          <p className="text-gray-600">
            Leverage AI to automate tedious tasks, allowing you to focus on what matters most.
          </p>
        </Card>
        <Card className="flex flex-col items-center p-6 text-center">
          <FileText className="h-10 w-10 text-blue-500 mb-4" />
          <h3 className="text-xl font-semibold text-gray-900 mb-2">Lead Management</h3>
          <p className="text-gray-600">
            Efficiently track, nurture, and convert your leads with our intuitive lead management system.
          </p>
        </Card>
      </div>

      <div className="mt-20 text-center text-gray-500 text-sm">
        <p>&copy; {new Date().getFullYear()} Your Company. All rights reserved.</p>
        <div className="mt-2 space-x-4">
          <Link to="/terms" className="hover:underline">Terms of Service</Link>
          <Link to="/privacy" className="hover:underline">Privacy Policy</Link>
        </div>
      </div>
    </div>
  )
}
