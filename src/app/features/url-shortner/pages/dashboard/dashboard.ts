import { CommonModule } from '@angular/common';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Component, DestroyRef, HostListener, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, ParamMap, Params, Router } from '@angular/router';
import { combineLatest, of, Subject } from 'rxjs';
import {
  catchError,
  distinctUntilChanged,
  map,
  shareReplay,
  startWith,
  switchMap,
  tap,
} from 'rxjs/operators';
import {
  PagedResult,
  UrlMappingListItem,
  UrlMappingListQuery,
  UrlService,
  UrlSortField,
} from '../../../../core/services/url';

const DEFAULT_QUERY: UrlMappingListQuery = {
  page: 1,
  pageSize: 10,
  search: '',
  sortBy: 'createdAt',
  sortDirection: 'desc',
};

const SORT_FIELDS: UrlSortField[] = ['createdAt', 'clickCount', 'shortCode', 'longUrl'];

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './dashboard.html',
  styleUrl: './dashboard.css',
})
export class Dashboard {
  private readonly destroyRef = inject(DestroyRef);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly urlService = inject(UrlService);
  private readonly refresh$ = new Subject<void>();
  private copyFeedbackTimer?: ReturnType<typeof setTimeout>;

  readonly pageSizeOptions = [10, 25, 50, 100];
  readonly query = signal<UrlMappingListQuery>({ ...DEFAULT_QUERY });
  readonly searchDraft = signal('');
  readonly listLoading = signal(false);
  readonly listError = signal('');
  readonly items = signal<UrlMappingListItem[]>([]);
  readonly totalCount = signal(0);
  readonly totalPages = signal(1);
  readonly activeMenuId = signal<string | null>(null);
  readonly createModalOpen = signal(false);
  readonly createLoading = signal(false);
  readonly createLongUrl = signal('');
  readonly createdShortUrl = signal('');
  readonly createError = signal('');
  readonly copyFeedback = signal('');

  readonly pageNumbers = computed(() => {
    const currentPage = this.query().page;
    const totalPages = this.totalPages();
    const maxVisiblePages = 5;
    const start = Math.max(1, Math.min(currentPage - 2, totalPages - maxVisiblePages + 1));
    const end = Math.min(totalPages, start + maxVisiblePages - 1);

    return Array.from({ length: Math.max(end - start + 1, 0) }, (_, index) => start + index);
  });

  readonly visibleRange = computed(() => {
    const totalCount = this.totalCount();
    const items = this.items();

    if (!totalCount || !items.length) {
      return { start: 0, end: 0 };
    }

    const start = (this.query().page - 1) * this.query().pageSize + 1;
    return { start, end: start + items.length - 1 };
  });

  constructor() {
    const query$ = this.route.queryParamMap.pipe(
      map((paramMap) => this.parseQuery(paramMap)),
      distinctUntilChanged((previous, current) => this.isSameQuery(previous, current)),
      tap((query) => {
        this.query.set(query);
        this.searchDraft.set(query.search);
        this.activeMenuId.set(null);
      }),
      shareReplay({ bufferSize: 1, refCount: true }),
      takeUntilDestroyed(this.destroyRef),
    );

    combineLatest([query$, this.refresh$.pipe(startWith(void 0))])
      .pipe(
        tap(() => {
          this.listLoading.set(true);
          this.listError.set('');
        }),
        switchMap(([query]) =>
          this.urlService.getUrlMappings(query).pipe(
            catchError(() => {
              this.listError.set('Unable to load shortened URLs right now.');
              return of<PagedResult<UrlMappingListItem> | null>(null);
            }),
          ),
        ),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((result) => {
        this.listLoading.set(false);

        if (!result) {
          this.items.set([]);
          this.totalCount.set(0);
          this.totalPages.set(1);
          return;
        }

        this.items.set(result.items);
        this.totalCount.set(result.totalCount);
        this.totalPages.set(Math.max(result.totalPages, 1));
      });

    this.destroyRef.onDestroy(() => {
      this.refresh$.complete();

      if (this.copyFeedbackTimer) {
        clearTimeout(this.copyFeedbackTimer);
      }
    });
  }

  @HostListener('document:keydown.escape')
  handleEscapeKey() {
    this.activeMenuId.set(null);

    if (this.createModalOpen() && !this.createLoading()) {
      this.closeCreateModal();
    }
  }

  @HostListener('document:click')
  handleDocumentClick() {
    this.activeMenuId.set(null);
  }

  sortLabel(field: UrlSortField) {
    switch (field) {
      case 'clickCount':
        return 'Clicks';
      case 'shortCode':
        return 'Short URL';
      case 'longUrl':
        return 'Long URL';
      default:
        return 'Created';
    }
  }

  isActiveSort(field: UrlSortField) {
    return this.query().sortBy === field;
  }

  currentSortDirection(field: UrlSortField) {
    return this.isActiveSort(field) ? this.query().sortDirection.toUpperCase() : '';
  }

  setSearchDraft(value: string) {
    this.searchDraft.set(value);
  }

  applyFilters() {
    this.updateQuery({
      search: this.searchDraft().trim(),
      page: 1,
    });
  }

  clearFilters() {
    this.searchDraft.set('');
    this.updateQuery({
      search: '',
      page: 1,
    });
  }

  changePage(page: number) {
    if (page < 1 || page > this.totalPages() || page === this.query().page) {
      return;
    }

    this.updateQuery({ page });
  }

  changePageSize(pageSize: string) {
    const parsedPageSize = Number(pageSize);

    if (!Number.isFinite(parsedPageSize) || parsedPageSize < 1) {
      return;
    }

    this.updateQuery({
      pageSize: Math.min(parsedPageSize, 100),
      page: 1,
    });
  }

  toggleSort(field: UrlSortField) {
    const currentQuery = this.query();
    const nextDirection =
      currentQuery.sortBy === field
        ? currentQuery.sortDirection === 'asc'
          ? 'desc'
          : 'asc'
        : 'asc';

    this.updateQuery({
      sortBy: field,
      sortDirection: nextDirection,
      page: 1,
    });
  }

  openCreateModal() {
    this.createModalOpen.set(true);
    this.createLongUrl.set('');
    this.createdShortUrl.set('');
    this.createError.set('');
    this.copyFeedback.set('');
  }

  closeCreateModal() {
    if (this.createLoading()) {
      return;
    }

    this.createModalOpen.set(false);
  }

  onCreateLongUrlChange(value: string) {
    this.createLongUrl.set(value);
    this.createdShortUrl.set('');
    this.createError.set('');
    this.copyFeedback.set('');
  }

  generateShortUrl() {
    const longUrl = this.createLongUrl().trim();

    if (!longUrl) {
      this.createError.set('Enter a long URL to generate a short one.');
      return;
    }

    this.createLoading.set(true);
    this.createError.set('');
    this.copyFeedback.set('');

    this.urlService
      .createShortUrl(longUrl)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: ({ shortUrl }) => {
          this.createdShortUrl.set(shortUrl);
          this.createLoading.set(false);
          this.refresh$.next();
        },
        error: () => {
          this.createError.set('Unable to generate a short URL right now.');
          this.createLoading.set(false);
        },
      });
  }

  toggleRowMenu(id: string, event: Event) {
    event.stopPropagation();
    this.activeMenuId.update((currentId) => (currentId === id ? null : id));
  }

  stopEvent(event: Event) {
    event.stopPropagation();
  }

  async copyShortUrl(shortUrl: string) {
    try {
      await navigator.clipboard.writeText(shortUrl);
      this.setCopyFeedback('Short URL copied to your clipboard.');
    } catch {
      this.setCopyFeedback('Copy failed. Please try again.');
    }
  }

  openShortUrl(shortUrl: string, event?: Event) {
    event?.stopPropagation();
    window.open(shortUrl, '_blank', 'noopener,noreferrer');
    this.activeMenuId.set(null);
  }

  shortUrlFor(item: UrlMappingListItem) {
    return this.urlService.buildShortUrl(item.shortCode);
  }

  private parseQuery(paramMap: ParamMap): UrlMappingListQuery {
    const page = this.parsePositiveNumber(paramMap.get('page'), DEFAULT_QUERY.page);
    const pageSize = Math.min(
      this.parsePositiveNumber(paramMap.get('pageSize'), DEFAULT_QUERY.pageSize),
      100,
    );
    const sortBy = this.parseSortField(paramMap.get('sortBy'));
    const sortDirection = paramMap.get('sortDirection') === 'asc' ? 'asc' : 'desc';

    return {
      page,
      pageSize,
      search: paramMap.get('search')?.trim() ?? '',
      sortBy,
      sortDirection,
    };
  }

  private parsePositiveNumber(value: string | null, fallback: number) {
    const parsedValue = Number(value);

    if (!Number.isFinite(parsedValue) || parsedValue < 1) {
      return fallback;
    }

    return Math.floor(parsedValue);
  }

  private parseSortField(value: string | null): UrlSortField {
    return SORT_FIELDS.find((field) => field === value) ?? DEFAULT_QUERY.sortBy;
  }

  private isSameQuery(previous: UrlMappingListQuery, current: UrlMappingListQuery) {
    return (
      previous.page === current.page &&
      previous.pageSize === current.pageSize &&
      previous.search === current.search &&
      previous.sortBy === current.sortBy &&
      previous.sortDirection === current.sortDirection
    );
  }

  private updateQuery(queryPatch: Partial<UrlMappingListQuery>) {
    const nextQuery = {
      ...this.query(),
      ...queryPatch,
    };

    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: this.toQueryParams(nextQuery),
    });
  }

  private toQueryParams(query: UrlMappingListQuery): Params {
    const params: Params = {};

    if (query.page !== DEFAULT_QUERY.page) {
      params['page'] = query.page;
    }

    if (query.pageSize !== DEFAULT_QUERY.pageSize) {
      params['pageSize'] = query.pageSize;
    }

    if (query.search) {
      params['search'] = query.search;
    }

    if (query.sortBy !== DEFAULT_QUERY.sortBy) {
      params['sortBy'] = query.sortBy;
    }

    if (query.sortDirection !== DEFAULT_QUERY.sortDirection) {
      params['sortDirection'] = query.sortDirection;
    }

    return params;
  }

  private setCopyFeedback(message: string) {
    this.copyFeedback.set(message);

    if (this.copyFeedbackTimer) {
      clearTimeout(this.copyFeedbackTimer);
    }

    this.copyFeedbackTimer = setTimeout(() => {
      this.copyFeedback.set('');
    }, 2500);
  }
}
