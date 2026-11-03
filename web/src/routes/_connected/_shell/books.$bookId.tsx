import { createFileRoute } from '@tanstack/react-router';
import { BookScreen } from '../../../screens/book-screen.tsx';

export const Route = createFileRoute('/_connected/_shell/books/$bookId')({
  component: BookRoute,
});

function BookRoute() {
  const { bookId } = Route.useParams();
  return <BookScreen bookId={bookId} />;
}
