/**
 * Name of the frame on the right of AnyRead's folder page. A frame keeps
 * its name while it moves from file to file, so a page can tell it is shown
 * there, and not inside some other page's frame (where AnyRead stays out).
 * In a module of its own, so the small picture script stays small.
 */
export const FOLDER_FRAME = 'anyread-folder'
export const inFolderFrame = () =>
  window.top !== window && window.name === FOLDER_FRAME
