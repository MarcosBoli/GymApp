import { PageHeader } from '../components/layout/PageHeader'
import { ProfileForm } from '../components/profile/ProfileForm'
import { BackupSection } from '../components/BackupSection'

export default function ProfilePage() {
  return (
    <>
      <PageHeader title="Perfil" />
      <div className="space-y-4">
        <ProfileForm />
        <BackupSection />
      </div>
    </>
  )
}
