export const apiUrl =
  localStorage.getItem('__API_URL_FOR_PRODUCTION_TEST_CASES__') ??
  import.meta.env.VITE_PUBLIC_API_URL
export const proxyUrl =
  localStorage.getItem('__PROXY_URL_FOR_PRODUCTION_TEST_CASES__') ??
  import.meta.env.VITE_PUBLIC_PROXY_URL
export const sharesUrl = import.meta.env.VITE_PUBLIC_SHARE_URL
export const shareUrl = (shareId: string) => `${sharesUrl}/${shareId}`
export const accountUrl = `${import.meta.env.VITE_PUBLIC_MAIN_URL}/account?type=${window.electron ? 'desktop' : 'web'}`
export const creditsUrl = `${import.meta.env.VITE_PUBLIC_MAIN_URL}/account/credits`
