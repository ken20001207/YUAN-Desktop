import BillingRecord, {
  InsertRecordForm,
  RecordForDisplay
} from '../../interface/Record';
import React, {createRef, useEffect, useMemo, useState} from 'react';
import categories, {subCategories} from '../../data/categories';
import accounts from '../../data/account';
import numberWithCommas from '../../utils/numberWithCommas';
import {Alert, Button, Icon} from 'rsuite';
import UpdateRecordForm from '../../components/UpdateRecordForm';
import useAppSelector from '../../../hooks/useAppSelector';
import useAppDispatch from '../../../hooks/useAppDispatch';
import RecordCard from '../../components/RecordCard';
import CreateRecordModal from '../../components/CreateRecordModal';
import getChineseDayNumber from '../../utils/getChineseDayNumber';
import IndexedDb from '../../IndexedDB';
import {
  insertRecord,
  loadRecordsFromIndexedDB
} from '../../store/record/action';

function getSumOfAccounts(records: BillingRecord[]) {
  const res: { [account: string]: number } = {};
  records.map((record) => {
    if (record.title === 'CATEGORY_ADJUSTMENT') {
      res[record.account] = record.amount;
      return;
    }
    if (res.hasOwnProperty(record.account)) {
      res[record.account] += record.amount + record.fee + record.discount;
    } else {
      res[record.account] = record.amount + record.fee + record.discount;
    }
  });
  return res;
}

function RecordsPage() {
  const records = useAppSelector<BillingRecord[]>(r => r.record.records);
  const dispatch = useAppDispatch();
  const [selectedRecord, setSelectedRecord] = useState<BillingRecord>();

  const innerRef = createRef<HTMLDivElement>();

  useEffect(() => {
    if (innerRef.current)
      innerRef.current.scrollTop = innerRef.current.scrollHeight;
  }, [records]);

  const sum = useMemo(() => {
    return getSumOfAccounts(records);
  }, [records]);

  const renderRecordsWithDate = (records: RecordForDisplay[]) => {
    if (records.length === 0) return [];
    let d = records[0].time;
    const res = [];

    res.push(
      <div className="date-tag">
        <p>
          {d.getFullYear() + '/' + (d.getMonth() + 1) + '/' + d.getDate()}
        </p>
      </div>);

    records.map(r => {
      if (r.time.getFullYear() !== d.getFullYear() || r.time.getMonth() !==
        d.getMonth() || r.time.getDate() !== d.getDate()) {
        d = r.time;

        res.push(
          <div className="date-tag">
            <p>
              {(d.getMonth() + 1) + '月' + d.getDate() + '日'}
              星期{getChineseDayNumber(d.getDay())}
            </p>
          </div>);
      }

      res.push(<RecordCard key={r.id} record={r}/>);
    });
    return res;
  };

  const displayRecords: RecordForDisplay[] = useMemo(() => {
    const today = new Date();
    return records.filter(
      r => Math.abs(r.time.getTime() - today.getTime()) < 2 * 30 * 24 * 60 *
        60 *
        1000)
      .map(r => {
        const c = categories.find(ca => ca.name === r.catagory);
        const s = subCategories.find(sc => sc.name === r.subCatagory);
        return {
          ...r,
          category: c ||
            {name: r.catagory, color: 'gray', icon: '🤔️', subCategories: []},
          subCategory: s ||
            {
              name: r.catagory,
              color: 'gray',
              icon: c ? c.icon : '🤔️',
              category: r.catagory
            }
        };
      })
      .sort((a, b) => a.time.getTime() - b.time.getTime());
  }, [records]);

  function handleImport(e: any) {
    e.preventDefault();
    const reader = new FileReader();
    reader.onload = async (ev) => {
      const text = ev.target?.result;
      const runIndexDb = async () => {
        const indexedDb = new IndexedDb('yuan');
        await indexedDb.createObjectStore(['billing_records']);
        await indexedDb.putBulkValue(
          'billing_records',
          JSON.parse(text as string)
        );

      };
      await runIndexDb();
      await dispatch(loadRecordsFromIndexedDB());
    };
    reader.readAsText(e.target.files[0]);
  }

  function resetAllData() {
    indexedDB.deleteDatabase('yuan');
    loadRecordsFromIndexedDB();
  }

  function handleImport2(e: any) {
    e.preventDefault();
    const reader = new FileReader();
    reader.onload = async (ev) => {
      const text = ev.target?.result;
      if (typeof (text) === 'string') handleLines(text.split('\n'));
    };
    reader.readAsText(e.target.files[0]);
  }

  const downloadTxtFile = () => {
    const element = document.createElement('a');
    const file = new Blob([JSON.stringify(
        records.sort((a, b) =>
          b.time.getTime() - a.time.getTime()),
        null, 2)],
      {type: 'text/plain'});
    element.href = URL.createObjectURL(file);
    element.download =
      'YUAN-exported-' + new Date().toLocaleDateString() + '.json';
    document.body.appendChild(element); // Required for this to work in FireFox
    element.click();
  };

  function handleLines(lines: string[]) {
    let tmp: InsertRecordForm = {
      category: '其他',
      subCategory: '其他',
      account: '中國銀行',
      amount: 0,
      currency: 'CNY',
      project: '',
      store: '',
      time: new Date(),
      title: '自動導入'
    };
    lines.map(async line => {
      if (line.replaceAll(' ', '').includes('交易时间')) {
        const d = new Date();
        const month = +line.split(':')[1]?.split('月')[0] - 1;
        const date = +line.split(':')[1]?.split('月')[1]?.split('日')[0];
        d.setMonth(month, date);
        tmp.time = d;
      }
      if (line.replaceAll(' ', '').includes('交易金额')) {
        const amount = +(line.split('币')[1].replaceAll(',', ''));
        tmp.amount = -1 * amount;
        if (isNaN(tmp.amount)) {
          Alert.error('Error: ' + line);
          return;
        }
        await dispatch(insertRecord({...tmp}));
      }
    });
  }

  return (
    <>
      <div className="left-section">
        {Object.keys(sum).map((key) => (
          <div key={key} className="account-sum-card">
            <p>{key}</p>
            <h3>
              <span style={{fontSize: 16, marginRight: 6, opacity: 0.5}}>
                {accounts.find(a => a.name === key)?.currency + '$'}
              </span>
              {numberWithCommas(sum[key])}
            </h3>
          </div>
        ))}
        <Button onClick={downloadTxtFile} appearance="primary">
          匯出為 JSON
        </Button>
        <input type="file" onChange={handleImport}/>
      </div>
      <div className="center-section">
        <div className="inner" ref={innerRef}>
          {renderRecordsWithDate(displayRecords)}
        </div>
        <div
          className="create-record-button"
          onClick={() => dispatch(
            {type: 'modal/open', modal: CreateRecordModal})}
        >
          <Icon icon="plus"/>
        </div>
      </div>
      <div className="right-section">
        <Button onClick={resetAllData}>Reset All</Button>
        <input type="file" onChange={handleImport2}/>
        {selectedRecord && (
          <UpdateRecordForm
            Record={selectedRecord}
            onUpdated={() => setSelectedRecord(undefined)}
            onCanceled={() => setSelectedRecord(undefined)}
          />
        )}
      </div>
    </>
  );
}

export default RecordsPage;
