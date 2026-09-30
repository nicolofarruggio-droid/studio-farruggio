import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'

export const metadata = { title: 'Accesso sospeso' }

export default function PaginaSospeso() {
  return (
    <Card className="w-full max-w-md">
      <CardHeader className="flex-col">
        <CardTitle className="text-xl">Il tuo accesso è stato disattivato</CardTitle>
        <CardDescription>
          Un admin del tuo studio ha disattivato il tuo account. Se pensi sia un errore, contatta il titolare dello studio.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form action="/auth/esci" method="post">
          <Button type="submit" variant="outline" className="w-full">Esci</Button>
        </form>
      </CardContent>
    </Card>
  )
}
