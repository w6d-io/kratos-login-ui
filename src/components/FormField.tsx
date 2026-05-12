'use client'

import { UiNode, UiNodeInputAttributes } from '@ory/client'
import clsx from 'clsx'

interface FormFieldProps {
  node: UiNode
  disabled?: boolean
  onChange?: (value: string) => void
}

export function FormField({ node, disabled, onChange }: FormFieldProps) {
  const attrs = node.attributes as UiNodeInputAttributes
  const label = node.meta?.label?.text || attrs.name
  const hasError = node.messages?.some(m => m.type === 'error')
  const errorMessage = node.messages?.find(m => m.type === 'error')?.text

  // Hidden fields - but show traits fields as disabled visible inputs
  if (attrs.type === 'hidden') {
    // If it's a trait field with a label and value, show it as disabled input
    if (attrs.name?.startsWith('traits.') && node.meta?.label && attrs.value) {
      return (
        <div className="space-y-1">
          <label className="block text-sm font-medium text-gray-300">
            {label}
          </label>
          <input
            type="text"
            name={attrs.name}
            value={attrs.value as string}
            readOnly
            className={clsx(
              'w-full px-4 py-3 rounded-lg transition',
              'bg-gray-800 text-gray-400 cursor-not-allowed',
              'border-2 border-transparent'
            )}
          />
        </div>
      )
    }
    // Regular hidden field
    return (
      <input
        type="hidden"
        name={attrs.name}
        value={attrs.value as string || ''}
      />
    )
  }

  // Submit button
  if (attrs.type === 'submit') {
    const isBackButton = attrs.name === 'screen' && attrs.value === 'previous'

    const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
      const form = e.currentTarget.closest('form')
      if (form) {
        // Set the correct hidden input based on the button's name (method or screen)
        const inputName = attrs.name || 'method'
        let hiddenInput = form.querySelector(`input[name="${inputName}"][type="hidden"]`) as HTMLInputElement
        if (!hiddenInput) {
          hiddenInput = document.createElement('input')
          hiddenInput.type = 'hidden'
          hiddenInput.name = inputName
          form.appendChild(hiddenInput)
        }
        hiddenInput.value = attrs.value as string || ''
      }
    }

    return (
      <button
        type="submit"
        name={attrs.name}
        value={attrs.value as string || ''}
        disabled={disabled || attrs.disabled}
        onClick={handleClick}
        formNoValidate={isBackButton}
        className={clsx(
          'w-full py-3 px-4 rounded-lg font-medium transition',
          'flex items-center justify-center gap-2',
          isBackButton
            ? 'bg-gray-600 hover:bg-gray-500 text-gray-200'
            : 'bg-primary-500 hover:bg-primary-600 text-white',
          'disabled:opacity-50 disabled:cursor-not-allowed'
        )}
      >
        {disabled && (
          <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
          </svg>
        )}
        {disabled ? 'Processing...' : label}
      </button>
    )
  }

  // Regular input fields
  return (
    <div className="space-y-1">
      <label 
        htmlFor={attrs.name}
        className="block text-sm font-medium text-gray-300"
      >
        {label}
        {attrs.required && <span className="text-red-400 ml-1">*</span>}
      </label>
      
      <input
        id={attrs.name}
        type={attrs.type}
        name={attrs.name}
        defaultValue={attrs.value as string || ''}
        placeholder={attrs.name === 'identifier' ? 'email@example.com' : ''}
        required={attrs.required}
        disabled={disabled || attrs.disabled}
        autoComplete={getAutoComplete(attrs.name, attrs.type)}
        onChange={(e) => {
          if (onChange && attrs.type === 'password') {
            onChange(e.target.value)
          }
        }}
        className={clsx(
          'w-full px-4 py-3 rounded-lg transition',
          'bg-gray-700 text-white placeholder-gray-400',
          'border-2 outline-none',
          hasError
            ? 'border-red-500 focus:border-red-400'
            : 'border-transparent focus:border-primary-500',
          'disabled:opacity-50 disabled:cursor-not-allowed'
        )}
      />
      
      {errorMessage && (
        <p className="text-sm text-red-400">{errorMessage}</p>
      )}
    </div>
  )
}

function getAutoComplete(name: string, type: string): string {
  if (name === 'identifier' || name === 'email') return 'email'
  if (name === 'password' && type === 'password') return 'current-password'
  if (name === 'password' && type === 'new-password') return 'new-password'
  if (name === 'totp_code') return 'one-time-code'
  return 'off'
}
