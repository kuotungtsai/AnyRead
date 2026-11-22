/**
 * A picture on the right of the folder page is Chrome's own page, with no
 * AnyRead page in it. Once it is clicked the keys go to it, so Esc is
 * caught here and sent to the folder page, which goes back to its list, as
 * Esc does for a file AnyRead shows. A picture on its own tab or in another
 * page's frame is left alone.
 */
import { inFolderFrame } from '@/core/folder-frame'

if (inFolderFrame()) {
  window.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      window.parent.postMessage({ type: 'anyread:close' }, '*')
    }
  })
}
