import { type } from 'arktype'
import { Result } from 'better-result'

/** MotherDuck's Postgres endpoint in its first region, for a token that names none. */
const MOTHERDUCK_HOST = 'pg.us-east-1-aws.motherduck.com'
const MOTHERDUCK_REGION = /^(?<cloud>[a-z]+)-(?<region>[a-z\d-]+)$/u
const motherduckClaims = type('string.json.parse').to({
  mdRegion: type.string.matching(MOTHERDUCK_REGION),
})

/** A token names its workspace's region (`aws-eu-central-1`), whose endpoint is `pg.eu-central-1-aws.motherduck.com`. */
export const getMotherduckHost = (token: string) =>
  Result.try(() => {
    const payload = token.split('.')[1] ?? ''
    const { mdRegion } = motherduckClaims.assert(
      atob(payload.replaceAll('-', '+').replaceAll('_', '/'))
    )
    const { cloud, region } = MOTHERDUCK_REGION.exec(mdRegion)?.groups ?? {}
    return `pg.${region}-${cloud}.motherduck.com`
  }).unwrapOr(MOTHERDUCK_HOST)
