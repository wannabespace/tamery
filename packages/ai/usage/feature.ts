export enum AiFeature {
  Chat = 'chat',
  ChatTitle = 'chat_title',
  CompleteQuery = 'complete_query',
  DiagnoseConnection = 'diagnose_connection',
  Filters = 'filters',
  FixQuery = 'fix_query',
  UpdateQuery = 'update_query',
}

export const aiFeatureLabels: Record<AiFeature, string> = {
  [AiFeature.Chat]: 'Chat',
  [AiFeature.ChatTitle]: 'Chat title',
  [AiFeature.CompleteQuery]: 'Complete query',
  [AiFeature.DiagnoseConnection]: 'Diagnose connection',
  [AiFeature.Filters]: 'Filters',
  [AiFeature.FixQuery]: 'Fix query',
  [AiFeature.UpdateQuery]: 'Update query',
}
