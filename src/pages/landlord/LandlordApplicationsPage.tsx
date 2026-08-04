import ApplicationsListPage from '../shared/ApplicationsListPage'

export default function LandlordApplicationsPage() {
  return (
    <ApplicationsListPage
      title="Applications"
      description="All applications on your units. Delete an in-progress application to remove it for the tenant and agent as well."
      allowDelete
      emptyMessage="No applications on your units yet."
    />
  )
}
