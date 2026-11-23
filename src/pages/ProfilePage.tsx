import { PageHeader } from '../components/layout/PageHeader'
import { ProfileForm } from '../components/profile/ProfileForm'
import { BackupSection } from '../components/BackupSection'
import { BackupReminder } from '../components/BackupReminder'

export default function ProfilePage() {
  return (
    <>
      <PageHeader title="Perfil" />
      <div className="space-y-4">
        <BackupReminder />
        <ProfileForm />
        <BackupSection />
        <p className="pb-2 text-center text-xs text-zinc-600">GymApp {__APP_VERSION__} · datos solo en este dispositivo</p>
      </div>
    </>
  )
}
