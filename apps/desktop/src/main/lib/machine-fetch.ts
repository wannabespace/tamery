import { MACHINE_RPC_PATH } from '@tamery/shared/ports'

/**
 * The renderer's machine calls: the packaged app's `file:` page sends `Origin: null`, which the machine refuses, while
 * Node's fetch sends no Origin and no cookies. Only a machine's RPC URL, so no window can make main fetch anything else.
 */
export const machineFetch = async (request: {
  url: string
  method: string
  headers: [string, string][]
  body: ArrayBuffer | string | null
}) => {
  const url = URL.parse(request.url)
  if (
    !url ||
    url.username ||
    url.password ||
    !(
      url.protocol === 'https:' ||
      (url.protocol === 'http:' && url.hostname === '127.0.0.1')
    ) ||
    !url.pathname.startsWith(`${MACHINE_RPC_PATH}/`)
  ) {
    throw new Error(`Refused ${request.url}: not a machine’s URL.`)
  }
  const response = await fetch(url, {
    body: request.body,
    headers: request.headers,
    method: request.method,
    redirect: 'error',
  })
  return {
    body: await response.arrayBuffer(),
    headers: [...response.headers],
    status: response.status,
    statusText: response.statusText,
  }
}
