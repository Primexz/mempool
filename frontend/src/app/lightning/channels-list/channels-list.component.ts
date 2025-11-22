import { ChangeDetectionStrategy, Component, EventEmitter, HostListener, Input, OnChanges, OnInit, Output } from '@angular/core';
import { UntypedFormBuilder, UntypedFormGroup } from '@angular/forms';
import { BehaviorSubject, merge, Observable } from 'rxjs';
import { map, switchMap, tap, debounceTime, startWith } from 'rxjs/operators';
import { isMobile } from '@app/shared/common.utils';
import { LightningApiService } from '@app/lightning/lightning-api.service';

@Component({
  selector: 'app-channels-list',
  templateUrl: './channels-list.component.html',
  styleUrls: ['./channels-list.component.scss'],
  standalone: false,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ChannelsListComponent implements OnInit, OnChanges {
  @Input() publicKey: string;
  @Output() channelsStatusChangedEvent = new EventEmitter<string>();
  @Output() loadingEvent = new EventEmitter<boolean>(false);
  channels$: Observable<any>;

  // @ts-ignore
  paginationSize: 'sm' | 'lg' = 'md';
  paginationMaxSize = 10;
  itemsPerPage = 10;
  page = 1;
  channelsPage$ = new BehaviorSubject<number>(1);
  channelStatusForm: UntypedFormGroup;
  defaultStatus = 'open';
  status = 'open';
  publicKeySize = 25;
  isLoading = false;
  isMobileDropdown = false;

  constructor(
    private lightningApiService: LightningApiService,
    private formBuilder: UntypedFormBuilder,
  ) { 
    this.channelStatusForm = this.formBuilder.group({
      status: [this.defaultStatus],
      alias: [''],
      columns: this.formBuilder.group({
        channelInfo: [true],
        local: [true],
        peer: [true],
        closingDate: [true],
      }),
    });
    if (isMobile()) {
      this.publicKeySize = 12;
    }
  }

  // helper getter for template convenience and typing
  get columns() {
    return this.channelStatusForm.get('columns') as any;
  }

  ngOnInit(): void {
    if (document.body.clientWidth < 670) {
      this.paginationSize = 'sm';
      this.paginationMaxSize = 3;
    }
    this.isMobileDropdown = document.body.clientWidth < 768;
  }

  @HostListener('window:resize')
  onResize(): void {
    this.isMobileDropdown = document.body.clientWidth < 768;
  }

  ngOnChanges(): void {
    this.channelStatusForm.get('status')!.setValue(this.defaultStatus, { emitEvent: true });
    this.channelsPage$.next(1);
  const statusChanges$ = this.channelStatusForm.get('status')!.valueChanges;
  // aliasChanges$ will be consumed inside the switchMap so we can startWith current value
    this.channels$ = merge(
      this.channelsPage$,
      statusChanges$,
    )
    .pipe(
      tap((val) => {
        this.isLoading = true;
        this.loadingEvent.emit(true);
        if (typeof val === 'string') {
          this.status = val;
          this.page = 1;
        } else if (typeof val === 'number') {
          this.page = val;
        }
      }),
      switchMap(() => {
        this.channelsStatusChangedEvent.emit(this.status);
        return this.lightningApiService.getChannelsByNodeId$(this.publicKey, (this.page - 1) * this.itemsPerPage, this.status);
      }),
      // After fetching, listen to alias changes (start with current value) and filter client-side
      switchMap((response) => {
        return this.channelStatusForm.get('alias')!.valueChanges.pipe(
          startWith(this.channelStatusForm.get('alias')!.value),
          debounceTime(200),
          map((alias) => ({ response, alias }))
        );
      }),
      map(({ response, alias }) => {
        this.isLoading = false;
        this.loadingEvent.emit(false);
        let channels = response.body as any[];
        if (alias && typeof alias === 'string' && alias.trim() !== '') {
          const term = alias.toLowerCase();
          channels = channels.filter((c) => (c.node && c.node.alias || '').toLowerCase().includes(term));
        }
        return {
          channels,
          totalItems: parseInt(response.headers.get('x-total-count'), 10)
        };
      }),
    );
  }

  pageChange(page: number): void {
    this.channelsPage$.next(page);
  }

}
