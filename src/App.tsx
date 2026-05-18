import React, { useEffect, useMemo, useState } from 'react';
import Papa from 'papaparse';
import { 
  format, 
  parse, 
  subDays, 
  isAfter, 
  isBefore, 
  startOfDay, 
  endOfDay,
  max
} from 'date-fns';
import {
  LineChart,
  Line,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  BarChart,
  Bar,
  Cell
} from 'recharts';
import { 
  LayoutDashboard, 
  Monitor, 
  Smartphone, 
  MousePointerClick, 
  Calendar, 
  Download,
  Flame,
  ArrowUpRight,
  ArrowDownRight,
  Activity,
  Info
} from 'lucide-react';

const SHEET_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vR4DmyrVgrrsgqA2sJ1_B4BE4YyyUkBgSE8wsBIWSnzrJZrTQd51xDSaSg3YDsWc98QZcu-NuNntj1A/pub?output=tsv';
const SHEET_PC_DETAIL_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vR4DmyrVgrrsgqA2sJ1_B4BE4YyyUkBgSE8wsBIWSnzrJZrTQd51xDSaSg3YDsWc98QZcu-NuNntj1A/pub?gid=1180632909&single=true&output=tsv';
const SHEET_MOBILE_DETAIL_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vR4DmyrVgrrsgqA2sJ1_B4BE4YyyUkBgSE8wsBIWSnzrJZrTQd51xDSaSg3YDsWc98QZcu-NuNntj1A/pub?gid=1007376928&single=true&output=tsv';

interface RawRow {
  Day: string;
  'Sum of Click PC': string;
  'Sum of Click Mobile': string;
}

interface DetailRow {
  block: string;
  click: number;
}

interface DataEntry {
  date: Date;
  dateStr: string;
  clickPC: number;
  clickMobile: number;
  totalClick: number;
}

type FilterPreset = 'latest' | 'last3' | 'last7' | 'last30' | 'quarter' | 'custom';

export default function App() {
  const [data, setData] = useState<DataEntry[]>([]);
  const [pcDetail, setPcDetail] = useState<DetailRow[]>([]);
  const [mobileDetail, setMobileDetail] = useState<DetailRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [preset, setPreset] = useState<FilterPreset>('last30');
  const [customRange, setCustomRange] = useState<{from: string, to: string}>({ from: '', to: '' });

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [mainRes, pcRes, mobileRes] = await Promise.all([
        fetch(SHEET_URL),
        fetch(SHEET_PC_DETAIL_URL),
        fetch(SHEET_MOBILE_DETAIL_URL)
      ]);
      
      const [mainCsv, pcCsv, mobileCsv] = await Promise.all([
        mainRes.text(),
        pcRes.text(),
        mobileRes.text()
      ]);
      
      // Parse Detail PC
      Papa.parse<any>(pcCsv, {
        header: true,
        delimiter: '\t',
        skipEmptyLines: true,
        complete: (results) => {
          const parsedDetail = results.data.map(row => {
            const blockNames = Object.values(row);
            return {
              block: (blockNames[0] as string) || 'N/A',
              click: parseInt(((blockNames[1] as string) || '0').replace(/,/g, ''), 10) || 0
            }
          }).sort((a, b) => b.click - a.click); // Sort descending
          // Filter top 15 blocks
          setPcDetail(parsedDetail.slice(0, 15));
        }
      });

      // Parse Detail Mobile
      Papa.parse<any>(mobileCsv, {
        header: true,
        delimiter: '\t',
        skipEmptyLines: true,
        complete: (results) => {
          const parsedDetail = results.data.map(row => {
            const blockNames = Object.values(row);
            return {
              block: (blockNames[0] as string) || 'N/A',
              click: parseInt(((blockNames[1] as string) || '0').replace(/,/g, ''), 10) || 0
            }
          }).sort((a, b) => b.click - a.click);
          setMobileDetail(parsedDetail.slice(0, 15));
        }
      });

      // Parse Main Data
      Papa.parse<RawRow>(mainCsv, {
        header: true,
        delimiter: '\t',
        skipEmptyLines: true,
        complete: (results) => {
          const parsedData = results.data
            .map(row => {
              // Parse date (Format: M/D/YYYY)
              const date = parse(row.Day, 'M/d/yyyy', new Date());
              
              // Clean number strings and parse
              const cleanPC = row['Sum of Click PC']?.replace(/,/g, '') || '0';
              const cleanMobile = row['Sum of Click Mobile']?.replace(/,/g, '') || '0';
              
              const clickPC = parseInt(cleanPC, 10) || 0;
              const clickMobile = parseInt(cleanMobile, 10) || 0;
              
              return {
                date,
                dateStr: format(date, 'dd/MM/yyyy'),
                clickPC,
                clickMobile,
                totalClick: clickPC + clickMobile
              };
            })
            // Sort chronologically just in case
            .sort((a, b) => a.date.getTime() - b.date.getTime());
            
          setData(parsedData);
          setLoading(false);
          
          // Set initial custom range to the bounds of data
          if (parsedData.length > 0) {
            const minDate = parsedData[0].date;
            const maxDate = parsedData[parsedData.length - 1].date;
            setCustomRange({
              from: format(minDate, 'yyyy-MM-dd'),
              to: format(maxDate, 'yyyy-MM-dd')
            });
          }
        }
      });
    } catch (error) {
      console.error('Error fetching data:', error);
      setLoading(false);
    }
  };

  // Compute Max Data Date
  const maxDataDate = useMemo(() => {
    if (data.length === 0) return new Date();
    return data[data.length - 1].date;
  }, [data]);

  // Derived filtered data and previous period data for trend
  const { filteredData, prevTotalPC, prevTotalMobile, prevTotalAll, periodDays } = useMemo(() => {
    if (data.length === 0) {
      return { filteredData: [], prevTotalPC: 0, prevTotalMobile: 0, prevTotalAll: 0, periodDays: 1 };
    }
    
    let fromDate = new Date();
    let toDate = maxDataDate; // Typically filter up to the latest available
    let periodDays = 1;

    switch (preset) {
      case 'latest':
        fromDate = startOfDay(maxDataDate);
        periodDays = 1;
        break;
      case 'last3':
        fromDate = startOfDay(subDays(maxDataDate, 2)); // include today, so going back 2 full days
        periodDays = 3;
        break;
      case 'last7':
        fromDate = startOfDay(subDays(maxDataDate, 6));
        periodDays = 7;
        break;
      case 'last30':
        fromDate = startOfDay(subDays(maxDataDate, 29));
        periodDays = 30;
        break;
      case 'quarter':
        fromDate = startOfDay(subDays(maxDataDate, 89));
        periodDays = 90;
        break;
      case 'custom':
        if (customRange.from) fromDate = startOfDay(parse(customRange.from, 'yyyy-MM-dd', new Date()));
        if (customRange.to) toDate = endOfDay(parse(customRange.to, 'yyyy-MM-dd', new Date()));
        periodDays = Math.round((toDate.getTime() - fromDate.getTime()) / (1000 * 3600 * 24)) + 1;
        break;
    }

    const filteredData = data.filter(item => {
      return item.date.getTime() >= fromDate.getTime() && item.date.getTime() <= toDate.getTime();
    });

    // Calculate previous period for trend
    const prevToDate = startOfDay(subDays(fromDate, 1));
    const prevFromDate = startOfDay(subDays(fromDate, periodDays));

    const prevData = data.filter(item => {
      return item.date.getTime() >= prevFromDate.getTime() && item.date.getTime() <= prevToDate.getTime();
    });

    const prevTotalPC = prevData.reduce((acc, curr) => acc + curr.clickPC, 0);
    const prevTotalMobile = prevData.reduce((acc, curr) => acc + curr.clickMobile, 0);
    const prevTotalAll = prevTotalPC + prevTotalMobile;

    return { filteredData, prevTotalPC, prevTotalMobile, prevTotalAll, periodDays };
  }, [data, preset, customRange, maxDataDate]);

  // Calculate KPIs
  const kpis = useMemo(() => {
    if (filteredData.length === 0) return null;
    
    const totalPC = filteredData.reduce((acc, curr) => acc + curr.clickPC, 0);
    const totalMobile = filteredData.reduce((acc, curr) => acc + curr.clickMobile, 0);
    const totalAll = totalPC + totalMobile;
    
    const avgPC = Math.round(totalPC / filteredData.length);
    const avgMobile = Math.round(totalMobile / filteredData.length);
    const avgTotal = Math.round(totalAll / filteredData.length);
    
    const calcTrend = (current: number, past: number) => {
      if (!past) return 0;
      return ((current - past) / past) * 100;
    };
    
    return {
      totalPC, totalMobile, totalAll,
      avgPC, avgMobile, avgTotal,
      pcPercentage: ((totalPC / totalAll) * 100).toFixed(1),
      mobilePercentage: ((totalMobile / totalAll) * 100).toFixed(1),
      trendPC: calcTrend(totalPC, prevTotalPC),
      trendMobile: calcTrend(totalMobile, prevTotalMobile),
      trendTotal: calcTrend(totalAll, prevTotalAll)
    };
  }, [filteredData, prevTotalPC, prevTotalMobile, prevTotalAll]);

  if (loading) {
    return (
      <div className="min-h-screen bg-neutral-50 flex items-center justify-center">
        <div className="flex flex-col items-center gap-4 text-red-800">
          <Activity className="w-12 h-12 animate-pulse" />
          <h2 className="text-xl font-medium">Đang tải dữ liệu VnExpress...</h2>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col md:flex-row justify-between items-center py-4 gap-4">
            <div className="flex items-center gap-3">
              <div className="bg-red-800 p-2 rounded-lg text-white">
                <LayoutDashboard className="w-6 h-6" />
              </div>
              <div>
                <h1 className="text-2xl font-bold tracking-tight text-slate-900">
                  VnExpress <span className="text-red-700">OV Market</span>
                </h1>
                <p className="text-sm text-slate-500 font-medium">Dashboard Tương Tác Clicks Trang Chủ</p>
              </div>
            </div>
            
            <button 
              onClick={fetchData}
              className="flex items-center gap-2 px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-md transition-colors text-sm font-medium"
            >
              <Download className="w-4 h-4" />
              Làm mới dữ liệu
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        
        {/* Filters Section */}
        <section className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-2 mr-2 text-slate-500">
              <Calendar className="w-5 h-5" />
              <span className="font-semibold text-sm uppercase tracking-wider">Thời gian:</span>
            </div>
            
            {(
              [
                { id: 'latest', label: `Mới nhất (${format(maxDataDate, 'dd/MM')})` },
                { id: 'last3', label: '3 Ngày Tới' }, // Will rename to 3 Ngày Qua
                { id: 'last7', label: '7 Ngày Qua' },
                { id: 'last30', label: '1 Tháng' },
                { id: 'quarter', label: '1 Quý (90N)' },
                { id: 'custom', label: 'Tuỳ chọn' },
              ] as const
            ).map((p) => (
              <button
                key={p.id}
                onClick={() => setPreset(p.id)}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                  preset === p.id 
                    ? 'bg-red-800 text-white shadow-md' 
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {p.id === 'last3' ? '3 Ngày Qua' : p.label}
              </button>
            ))}
          </div>

          {preset === 'custom' && (
            <div className="flex items-center gap-2 text-sm bg-slate-50 p-2 rounded-lg border border-slate-200">
              <input
                type="date"
                value={customRange.from}
                onChange={(e) => setCustomRange(prev => ({ ...prev, from: e.target.value }))}
                className="px-2 py-1 border border-slate-300 rounded focus:outline-none focus:ring-2 focus:ring-red-500"
              />
              <span className="text-slate-500">-</span>
              <input
                type="date"
                value={customRange.to}
                onChange={(e) => setCustomRange(prev => ({ ...prev, to: e.target.value }))}
                className="px-2 py-1 border border-slate-300 rounded focus:outline-none focus:ring-2 focus:ring-red-500"
              />
            </div>
          )}
        </section>

        {kpis && (
          <>
            {/* KPI Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {/* Total Card */}
              <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 flex flex-col relative overflow-hidden group">
                <div className="absolute top-0 right-0 p-6 opacity-5 group-hover:opacity-10 transition-opacity">
                  <Flame className="w-24 h-24 text-red-800" />
                </div>
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 rounded-full bg-red-100 text-red-800 flex items-center justify-center">
                    <MousePointerClick className="w-5 h-5" />
                  </div>
                  <h3 className="font-semibold text-slate-600">Tổng Lượt Click</h3>
                </div>
                <div className="flex items-end justify-between z-10">
                  <div>
                    <div className="text-4xl font-bold tracking-tight text-slate-900">
                      {kpis.totalAll.toLocaleString('vi-VN')}
                    </div>
                    <div className="flex items-center gap-1.5 mt-1 text-slate-500 text-sm group-hover:text-slate-700 transition-colors">
                      <span>Trung bình {kpis.avgTotal.toLocaleString('vi-VN')}/ngày</span>
                      <Info className="w-4 h-4" title={`Trung bình lượt theo ngày = Tổng số lượt click / Số ngày chọn (${periodDays} ngày)`} />
                    </div>
                  </div>
                  <div className="flex flex-col items-end">
                    <div className={`flex items-center gap-1 text-sm font-medium ${kpis.trendTotal >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                      {kpis.trendTotal >= 0 ? <ArrowUpRight className="w-4 h-4" /> : <ArrowDownRight className="w-4 h-4" />}
                      {Math.abs(kpis.trendTotal).toFixed(1)}%
                    </div>
                    <span className="text-xs text-slate-400 mt-0.5" title={`${periodDays} ngày kỳ trước: ${prevTotalAll.toLocaleString('vi-VN')} clicks`}>
                      vs {periodDays} ngày trước
                    </span>
                  </div>
                </div>
              </div>

              {/* PC Card */}
              <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 flex flex-col relative overflow-hidden group">
                <div className="absolute top-0 right-0 p-6 opacity-5 group-hover:opacity-10 transition-opacity">
                  <Monitor className="w-24 h-24 text-blue-800" />
                </div>
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center">
                    <Monitor className="w-5 h-5" />
                  </div>
                  <h3 className="font-semibold text-slate-600">Click PC</h3>
                </div>
                <div className="flex items-end justify-between z-10">
                  <div>
                    <div className="text-4xl font-bold tracking-tight text-slate-900">
                      {kpis.totalPC.toLocaleString('vi-VN')}
                    </div>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-sm text-slate-500">Tỷ trọng:</span>
                      <span className="text-sm font-semibold text-blue-600 bg-blue-50 px-2 py-0.5 rounded">
                        {kpis.pcPercentage}%
                      </span>
                    </div>
                  </div>
                  <div className="flex flex-col items-end">
                    <div className={`flex items-center gap-1 text-sm font-medium ${kpis.trendPC >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                      {kpis.trendPC >= 0 ? <ArrowUpRight className="w-4 h-4" /> : <ArrowDownRight className="w-4 h-4" />}
                      {Math.abs(kpis.trendPC).toFixed(1)}%
                    </div>
                    <span className="text-xs text-slate-400 mt-0.5">
                      vs {periodDays} ngày trước
                    </span>
                  </div>
                </div>
              </div>

              {/* Mobile Card */}
              <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 flex flex-col relative overflow-hidden group">
                <div className="absolute top-0 right-0 p-6 opacity-5 group-hover:opacity-10 transition-opacity">
                  <Smartphone className="w-24 h-24 text-emerald-800" />
                </div>
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center">
                    <Smartphone className="w-5 h-5" />
                  </div>
                  <h3 className="font-semibold text-slate-600">Click Mobile</h3>
                </div>
                <div className="flex items-end justify-between z-10">
                  <div>
                    <div className="text-4xl font-bold tracking-tight text-slate-900">
                      {kpis.totalMobile.toLocaleString('vi-VN')}
                    </div>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-sm text-slate-500">Tỷ trọng:</span>
                      <span className="text-sm font-semibold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded">
                        {kpis.mobilePercentage}%
                      </span>
                    </div>
                  </div>
                  <div className="flex flex-col items-end">
                    <div className={`flex items-center gap-1 text-sm font-medium ${kpis.trendMobile >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                      {kpis.trendMobile >= 0 ? <ArrowUpRight className="w-4 h-4" /> : <ArrowDownRight className="w-4 h-4" />}
                      {Math.abs(kpis.trendMobile).toFixed(1)}%
                    </div>
                    <span className="text-xs text-slate-400 mt-0.5">
                      vs {periodDays} ngày trước
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Charts Section */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              
              {/* Main Trend Line Chart */}
              <div className="lg:col-span-2 bg-white p-6 rounded-xl shadow-sm border border-slate-200">
                <div className="mb-6">
                  <h3 className="text-lg font-bold text-slate-900">Biểu Đồ Xu Hướng Tổng Quan</h3>
                  <p className="text-sm text-slate-500">Theo dõi lượng click theo thời gian giữa PC và Mobile</p>
                </div>
                <div className="h-[400px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart
                      data={filteredData}
                      margin={{ top: 10, right: 30, left: 0, bottom: 0 }}
                    >
                      <defs>
                        <linearGradient id="colorMobile" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#10b981" stopOpacity={0.8}/>
                          <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                        </linearGradient>
                        <linearGradient id="colorPC" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#2563eb" stopOpacity={0.8}/>
                          <stop offset="95%" stopColor="#2563eb" stopOpacity={0}/>
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                      <XAxis 
                        dataKey="dateStr" 
                        stroke="#64748b" 
                        fontSize={12} 
                        tickMargin={10} 
                        minTickGap={30}
                      />
                      <YAxis 
                        stroke="#64748b" 
                        fontSize={12} 
                        tickFormatter={(val) => `${(val / 1000).toFixed(0)}k`}
                        domain={[0, 'auto']}
                      />
                      <Tooltip 
                        contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                        formatter={(value: number) => new Intl.NumberFormat('vi-VN').format(value)}
                        labelStyle={{ color: '#475569', fontWeight: 'bold', marginBottom: '4px' }}
                      />
                      <Legend verticalAlign="top" height={36}/>
                      <Area 
                        type="monotone" 
                        dataKey="clickMobile" 
                        name="Mobile Clicks" 
                        stroke="#10b981" 
                        fillOpacity={1} 
                        fill="url(#colorMobile)" 
                        strokeWidth={2}
                      />
                      <Area 
                        type="monotone" 
                        dataKey="clickPC" 
                        name="PC Clicks" 
                        stroke="#2563eb" 
                        fillOpacity={1} 
                        fill="url(#colorPC)" 
                        strokeWidth={2}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Bar Chart Comparison */}
              <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
                <div className="mb-6">
                  <h3 className="text-lg font-bold text-slate-900">Trung Bình Lượt Theo Ngày</h3>
                  <p className="text-sm text-slate-500">So sánh thiết bị (Trung bình/ngày)</p>
                </div>
                <div className="h-[400px] w-full mt-4">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={[
                        { name: 'PC', value: kpis.avgPC, fill: '#2563eb' },
                        { name: 'Mobile', value: kpis.avgMobile, fill: '#10b981' }
                      ]}
                      margin={{ top: 20, right: 30, left: 20, bottom: 5 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                      <XAxis dataKey="name" stroke="#64748b" fontSize={14} fontWeight="medium"/>
                      <YAxis 
                        stroke="#64748b" 
                        fontSize={12}
                        tickFormatter={(val) => `${(val / 1000).toFixed(0)}k`}
                       />
                      <Tooltip 
                        cursor={{fill: '#f1f5f9'}}
                        formatter={(value: number) => new Intl.NumberFormat('vi-VN').format(value)}
                        contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                      />
                      <Bar 
                        dataKey="value" 
                        radius={[6, 6, 0, 0]} 
                        barSize={60}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>
            
            {/* Detail Block Charts Section */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-6">
              {/* PC Detail Blocks */}
              <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
                <div className="mb-6">
                  <h3 className="text-lg font-bold text-slate-900">Chi tiết các Block trên PC (Tất cả)</h3>
                  <p className="text-sm text-slate-500">15 block có lượng click cao nhất trên PC (Tổng hợp mọi thời điểm)</p>
                </div>
                <div className="h-[500px] w-full mt-4">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={pcDetail}
                      layout="vertical"
                      margin={{ top: 0, right: 30, left: 40, bottom: 0 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#e2e8f0" />
                      <XAxis type="number" stroke="#64748b" fontSize={12} tickFormatter={(val) => `${(val / 1000).toFixed(0)}k`} />
                      <YAxis type="category" dataKey="block" width={100} stroke="#64748b" fontSize={11} interval={0} />
                      <Tooltip 
                        cursor={{fill: '#f1f5f9'}}
                        formatter={(value: number) => [new Intl.NumberFormat('vi-VN').format(value), 'Lượt click']}
                        labelStyle={{ color: '#000', fontWeight: 'bold', marginBottom: '4px' }}
                        contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                      />
                      <Bar 
                        dataKey="click" 
                        radius={[0, 4, 4, 0]} 
                        barSize={20}
                        fill="#2563eb"
                      >
                        {pcDetail.map((entry, index) => (
                           <Cell key={`cell-${index}`} fill={'#2563eb'} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Mobile Detail Blocks */}
              <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
                <div className="mb-6">
                  <h3 className="text-lg font-bold text-slate-900">Chi tiết các Block trên Mobile (Tất cả)</h3>
                  <p className="text-sm text-slate-500">15 block có lượng click cao nhất trên Mobile (Tổng hợp mọi thời điểm)</p>
                </div>
                <div className="h-[500px] w-full mt-4">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={mobileDetail}
                      layout="vertical"
                      margin={{ top: 0, right: 30, left: 40, bottom: 0 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#e2e8f0" />
                      <XAxis type="number" stroke="#64748b" fontSize={12} tickFormatter={(val) => `${(val / 1000).toFixed(0)}k`} />
                      <YAxis type="category" dataKey="block" width={100} stroke="#64748b" fontSize={11} interval={0} />
                      <Tooltip 
                        cursor={{fill: '#f1f5f9'}}
                        formatter={(value: number) => [new Intl.NumberFormat('vi-VN').format(value), 'Lượt click']}
                        labelStyle={{ color: '#000', fontWeight: 'bold', marginBottom: '4px' }}
                        contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                      />
                      <Bar 
                        dataKey="click" 
                        radius={[0, 4, 4, 0]} 
                        barSize={20}
                        fill="#10b981"
                      >
                         {mobileDetail.map((entry, index) => (
                           <Cell key={`cell-${index}`} fill={'#10b981'} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>
            
            {/* Detail Table */}
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
               <div className="p-6 border-b border-slate-200">
                  <h3 className="text-lg font-bold text-slate-900">Chi Tiết Theo Ngày</h3>
                  <p className="text-sm text-slate-500">Dữ liệu chi tiết số lượng click trong giai đoạn đã chọn</p>
               </div>
               <div className="overflow-x-auto">
                 <table className="w-full text-left text-sm text-slate-600">
                   <thead className="bg-slate-50 text-slate-900 uppercase font-semibold text-xs border-b border-slate-200">
                     <tr>
                       <th className="px-6 py-4">Ngày</th>
                       <th className="px-6 py-4 text-right">Lượt Click PC</th>
                       <th className="px-6 py-4 text-right">Lượt Click Mobile</th>
                       <th className="px-6 py-4 text-right">Tổng Clicks</th>
                     </tr>
                   </thead>
                   <tbody className="divide-y divide-slate-200 bg-white">
                     {filteredData.slice().reverse().map((row, idx) => (
                       <tr key={idx} className="hover:bg-slate-50 transition-colors">
                         <td className="px-6 py-3 font-medium text-slate-900">{row.dateStr}</td>
                         <td className="px-6 py-3 text-right text-blue-700 font-medium">
                           {row.clickPC.toLocaleString('vi-VN')}
                         </td>
                         <td className="px-6 py-3 text-right text-emerald-700 font-medium">
                           {row.clickMobile.toLocaleString('vi-VN')}
                         </td>
                         <td className="px-6 py-3 text-right font-bold text-slate-900">
                           {row.totalClick.toLocaleString('vi-VN')}
                         </td>
                       </tr>
                     ))}
                   </tbody>
                 </table>
               </div>
            </div>
          </>
        )}
        
        {filteredData.length === 0 && !loading && (
          <div className="bg-white p-12 text-center rounded-xl border border-slate-200">
            <Calendar className="w-16 h-16 text-slate-300 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-slate-900">Không có dữ liệu</h3>
            <p className="text-slate-500">Không tìm thấy dữ liệu click trong khoảng thời gian đã chọn.</p>
          </div>
        )}
      </main>
    </div>
  );
}
