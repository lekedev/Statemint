import LoginForm from './LoginForm'

export default function RightPanel() {
  return (
    <section
      className="flex items-center justify-center px-8 py-16"
      style={{ background: 'var(--surface)' }}
    >
      <LoginForm />
    </section>
  )
}
