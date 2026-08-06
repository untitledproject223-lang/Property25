import ApplicationsListPage from '../shared/ApplicationsListPage'

export default function LandlordApplicationsPage() {
  return (
    <ApplicationsListPage
      title="Applications"
      description="All applications on your units. Start a new application yourself, or delete an in-progress one to remove it for the tenant and agent as well."
      allowDelete
      emptyMessage="No applications on your units yet."
      newApplicationHref="/apply"
    />
  )
}
