import ApplicationsListPage from '../shared/ApplicationsListPage'

export default function TenantApplicationsPage() {
  return (
    <ApplicationsListPage
      title="Applications"
      description="Your applications and progress. If an agent or landlord deletes an in-progress application, it will disappear from this list."
      allowDelete={false}
      emptyMessage="No applications yet."
    />
  )
}
