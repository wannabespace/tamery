import { engines, Provider } from '@tamery/shared/enums/connection-type'

export const shownEngines = engines.filter(
  ({ provider }) => provider !== Provider.MongoDBAtlas
)
