import { Suspense } from 'react'
import SearchResultsPage from './search-results-page'

export default function SearchPage({
  searchParams,
}: {
  searchParams: { q?: string; scope?: string; channel?: string; author?: string; from?: string; to?: string; sort?: string; page?: string }
}) {
  return (
    <Suspense>
      <SearchResultsPage {...searchParams} />
    </Suspense>
  )
}
