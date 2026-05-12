'use client'

import { Component, ReactNode } from 'react'

interface Props {
  children: ReactNode
  fallback?: ReactNode
  onError?: () => void
}

interface State {
  hasError: boolean
}

/**
 * Error boundary for Ory Elements components.
 * Catches crashes from Elements internal flow handling
 * (e.g. "Cannot read properties of undefined (reading 'nodes')")
 * and shows a reload button instead of crashing the page.
 */
export class SafeOryFlow extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false }
  }

  static getDerivedStateFromError(): State {
    return { hasError: true }
  }

  componentDidCatch(error: Error) {
    console.error('[SafeOryFlow] Ory Elements error caught:', error.message)
    if (this.props.onError) {
      // Reset error state and let parent handle recovery (e.g. re-fetch flow)
      setTimeout(() => {
        this.setState({ hasError: false })
        this.props.onError!()
      }, 0)
    }
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback || (
        <div className="text-center py-8">
          <p className="text-gray-400 mb-4">Something went wrong. Please try again.</p>
          <button
            onClick={() => {
              this.setState({ hasError: false })
              window.location.reload()
            }}
            className="bg-blue-500 hover:bg-blue-600 text-white px-6 py-2 rounded-lg"
          >
            Reload
          </button>
        </div>
      )
    }
    return this.props.children
  }
}
