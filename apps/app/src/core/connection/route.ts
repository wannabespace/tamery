import { getRouteApi } from '@tanstack/react-router'

const resourceRoute = getRouteApi('/_protected/connection/$resourceId')
const tabRoute = getRouteApi('/_protected/connection/$resourceId/$tabId')

export const useConnectionContext = resourceRoute.useRouteContext
export const useConnectionParams = resourceRoute.useParams
export const useTabContext = tabRoute.useRouteContext
export const useTabNavigate = tabRoute.useNavigate
export const useTabParams = tabRoute.useParams
export const useTabSearch = tabRoute.useSearch
