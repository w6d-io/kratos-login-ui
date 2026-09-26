'use client'

import { Icons } from '@/components/ui/Icons'
import { CopyButton } from './Parts'

/** "Lost your device?" — what to do when the usual second factor isn't at hand. */
export function LostDeviceHelp({ onUseBackupCode, helpUrl }: { onUseBackupCode?: () => void; helpUrl?: string | null }) {
  return (
    <details className="disclosure">
      <summary><Icons.ChevronRight size={14} /> Lost your device or can&apos;t get a code?</summary>
      <div className="disclosure-body">
        <ul>
          {onUseBackupCode && (
            <li>
              Use one of the <button type="button" className="btn-link" onClick={onUseBackupCode}>backup codes</button> you
              saved when you turned on two-step sign-in. Each works once.
            </li>
          )}
          <li>Check the time on your phone is set automatically — authenticator codes depend on it.</li>
          <li>
            Still stuck? {helpUrl
              ? <a href={helpUrl} target="_blank" rel="noopener noreferrer">Contact support</a>
              : 'Ask your administrator'} to reset two-step sign-in for your account.
          </li>
        </ul>
      </div>
    </details>
  )
}

export function codesAsText(codes: string[], appName: string, account: string): string {
  const lines = [
    `${appName} — backup codes${account ? ` for ${account}` : ''}`,
    `Saved ${new Date().toISOString().slice(0, 10)}`,
    '',
    'Each code works once. Keep them somewhere safe, like a password manager.',
    '',
    ...codes.map((c, i) => `${String(i + 1).padStart(2, ' ')}. ${c}`),
    '',
  ]
  return lines.join('\n')
}

/** The codes, with the three ways people actually keep them: copy, download, print. */
export function RecoveryCodes({ codes, appName, account }: { codes: string[]; appName: string; account: string }) {
  const text = codesAsText(codes, appName, account)
  const download = () => {
    const url = URL.createObjectURL(new Blob([text], { type: 'text/plain' }))
    const a = document.createElement('a')
    a.href = url
    a.download = `${appName.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-backup-codes.txt`
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
  }
  return (
    <div className="codes-print">
      <ol className="codes-grid" aria-label="Backup codes">
        {codes.map((c, i) => <li key={i}><span className="code">{c}</span></li>)}
      </ol>
      <div className="codes-actions">
        <CopyButton text={codes.join('\n')} label="Copy all" />
        <button type="button" className="btn btn-secondary btn-sm" onClick={download}>
          <Icons.Download size={14} /> Download
        </button>
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => window.print()}>
          <Icons.Printer size={14} /> Print
        </button>
      </div>
    </div>
  )
}
