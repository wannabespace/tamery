export enum AiFeature {
  ApprovalJudge = 'approval_judge',
  Chat = 'chat',
  ChatTitle = 'chat_title',
  CompleteQuery = 'complete_query',
  Dictation = 'dictation',
  DiagnoseConnection = 'diagnose_connection',
  Filters = 'filters',
  FixQuery = 'fix_query',
  UpdateQuery = 'update_query',
}

export const aiFeatureLabels: Record<AiFeature, string> = {
  [AiFeature.ApprovalJudge]: 'Approval judge',
  [AiFeature.Chat]: 'Chat',
  [AiFeature.ChatTitle]: 'Chat title',
  [AiFeature.CompleteQuery]: 'Complete query',
  [AiFeature.Dictation]: 'Dictation',
  [AiFeature.DiagnoseConnection]: 'Diagnose connection',
  [AiFeature.Filters]: 'Filters',
  [AiFeature.FixQuery]: 'Fix query',
  [AiFeature.UpdateQuery]: 'Update query',
}
