import ApplicationsListPage from '../shared/ApplicationsListPage'

export default function AgentApplicationsPage() {
  return (
    <ApplicationsListPage
      title="Applications"
      description="All rental applications and their progress. Delete an in-progress application to remove it for the tenant and landlord as well."
      allowDelete
      emptyMessage="No applications yet. Start one with New application."
      newApplicationHref="/apply"
    />
  )
}
