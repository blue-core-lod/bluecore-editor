import { useSyncExternalStore } from 'react'

import { databaseState, onDatabaseState } from '../drafts/db'
import { useNewVersion } from './version'

/**
 * What to do when the editor has changed under this tab: another tab is
 * running an older version and holding up this one's drafts, a newer version
 * in another tab has taken the drafts over, or a newer version has been
 * deployed. Shown on every page, since any of them can happen anywhere.
 */
export function UpdateNotice() {
  const database = useSyncExternalStore(onDatabaseState, databaseState)
  const newer = useNewVersion()

  if (database === 'blocked') {
    return (
      <div className="update-notice" role="alert">
        Another tab has an older version of the editor open, so this one can’t keep drafts. Close your other
        Blue Core editor tabs, in any window, and this note will go.
      </div>
    )
  }
  if (database === 'superseded') {
    return (
      <div className="update-notice" role="alert">
        The editor was updated in another tab, so this one can no longer keep drafts. Save your changes to Blue
        Core, then reload.{' '}
        <button type="button" className="secondary" onClick={() => window.location.reload()}>
          Reload
        </button>
      </div>
    )
  }
  if (newer) {
    return (
      <div className="update-notice" role="status">
        A new version of the editor is available. Unsaved changes are kept as a draft when you reload.{' '}
        <button type="button" className="secondary" onClick={() => window.location.reload()}>
          Reload
        </button>
      </div>
    )
  }
  return null
}
