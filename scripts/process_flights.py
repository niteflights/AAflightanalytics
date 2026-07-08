
import argparse, json, math
from pathlib import Path
import pandas as pd
COLS={"serial":"serial","from":"from","to":"to","date":"date","operator":"operator","flight no":"flight_number","flight_no":"flight_number","flight number":"flight_number","aircraft":"aircraft","boarding pass":"boarding_pass","boarding_pass":"boarding_pass"}
def read_flights(path):
    ext=Path(path).suffix.lower(); df=pd.read_excel(path) if ext in ['.xlsx','.xls'] else pd.read_csv(path)
    df.columns=[str(c).strip().lower() for c in df.columns]; df=df.rename(columns={c:COLS[c] for c in df.columns if c in COLS})
    for c in ['from','to','date']:
        if c not in df: raise ValueError(f'Missing required column: {c}')
    for c in ['serial','operator','flight_number','aircraft','boarding_pass']:
        if c not in df: df[c]=''
    df['date']=pd.to_datetime(df['date'],errors='coerce'); df=df.dropna(subset=['date'])
    df['from']=df['from'].astype(str).str.strip().str.upper(); df['to']=df['to'].astype(str).str.strip().str.upper()
    df['operator']=df['operator'].fillna('Unknown').astype(str).str.strip().replace('', 'Unknown')
    for c in ['flight_number','aircraft','boarding_pass']: df[c]=df[c].fillna('').astype(str).str.strip()
    return df[(df['from'].str.len()==3)&(df['to'].str.len()==3)]
def read_airports(path):
    ap=pd.read_csv(path); ap.columns=[str(c).strip().lower() for c in ap.columns]
    ap=ap.rename(columns={c:'iata' for c in ap.columns if c in ['iata','iata_code']})
    ap=ap.rename(columns={c:'lat' for c in ap.columns if c in ['lat','latitude']})
    ap=ap.rename(columns={c:'lon' for c in ap.columns if c in ['lon','lng','longitude']})
    for c in ['iata','lat','lon']:
        if c not in ap: raise ValueError('airports.csv must contain iata, lat, lon')
    for c in ['name','city','country']:
        if c not in ap: ap[c]=''
    ap['iata']=ap['iata'].astype(str).str.strip().str.upper()
    return ap.dropna(subset=['iata','lat','lon']).drop_duplicates('iata')[['iata','name','city','country','lat','lon']]
def hav(lat1,lon1,lat2,lon2):
    R=6371.0088; p1=math.radians(float(lat1)); p2=math.radians(float(lat2)); dp=math.radians(float(lat2)-float(lat1)); dl=math.radians(float(lon2)-float(lon1)); a=math.sin(dp/2)**2+math.cos(p1)*math.cos(p2)*math.sin(dl/2)**2; return 2*R*math.atan2(math.sqrt(a), math.sqrt(1-a))
def fnum(x): return None if pd.isna(x) else float(x)
def main():
    pa=argparse.ArgumentParser(); pa.add_argument('--input',default='data/flight_log.csv'); pa.add_argument('--airports',default='data/airports.csv'); pa.add_argument('--output',default='web/public/data'); pa.add_argument('--co2-factor',type=float,default=0.115); pa.add_argument('--rfi',type=float,default=1.0); a=pa.parse_args()
    out=Path(a.output); out.mkdir(parents=True,exist_ok=True); fl=read_flights(a.input); ap=read_airports(a.airports)
    df=fl.merge(ap.add_prefix('from_'),left_on='from',right_on='from_iata',how='left').merge(ap.add_prefix('to_'),left_on='to',right_on='to_iata',how='left')
    df['distance_km']=[hav(r.from_lat,r.from_lon,r.to_lat,r.to_lon) if pd.notna(r.from_lat) and pd.notna(r.to_lat) else None for r in df.itertuples()]
    df['co2_kg']=df['distance_km'].astype(float)*a.co2_factor*a.rfi; df['year']=df['date'].dt.year; df['month']=df['date'].dt.strftime('%Y-%m'); df['date_str']=df['date'].dt.strftime('%Y-%m-%d')
    flights=[]; route_feats=[]
    for i,r in df.reset_index(drop=True).iterrows():
        rec={'id':int(i),'serial':str(r.get('serial','')),'date':r.date_str,'year':int(r.year),'month':r.month,'from':r['from'],'to':r['to'],'operator':r.operator,'flightNumber':r.flight_number,'aircraft':r.aircraft,'boardingPass':r.boarding_pass,'distanceKm':fnum(r.distance_km),'co2Kg':fnum(r.co2_kg),'fromAirport':{'iata':r.get('from_iata'),'name':r.get('from_name'),'city':r.get('from_city'),'country':r.get('from_country'),'lat':fnum(r.get('from_lat')),'lon':fnum(r.get('from_lon'))},'toAirport':{'iata':r.get('to_iata'),'name':r.get('to_name'),'city':r.get('to_city'),'country':r.get('to_country'),'lat':fnum(r.get('to_lat')),'lon':fnum(r.get('to_lon'))}}
        flights.append(rec)
        if rec['fromAirport']['lat'] is not None and rec['toAirport']['lat'] is not None:
            route_feats.append({'type':'Feature','geometry':{'type':'LineString','coordinates':[[rec['fromAirport']['lon'],rec['fromAirport']['lat']],[rec['toAirport']['lon'],rec['toAirport']['lat']]]},'properties':{k:rec[k] for k in ['id','date','year','month','from','to','operator','flightNumber','aircraft','distanceKm','co2Kg']}})
    seen=set(pd.concat([df['from'],df['to']]).dropna().unique()); counts=pd.concat([df['from'],df['to']]).value_counts(); dep=df.groupby('from').size(); arr=df.groupby('to').size()
    ap_feats=[]
    for iata in sorted(seen):
        row=ap[ap.iata==iata]
        if row.empty: continue
        r=row.iloc[0]; ap_feats.append({'type':'Feature','geometry':{'type':'Point','coordinates':[float(r.lon),float(r.lat)]},'properties':{'iata':iata,'name':r.get('name',''),'city':r.get('city',''),'country':r.get('country',''),'movements':int(counts.get(iata,0)),'departures':int(dep.get(iata,0)),'arrivals':int(arr.get(iata,0))}})
    airline=df.groupby(df['operator'].fillna('Unknown')).agg(flights=('operator','size'),totalDistanceKm=('distance_km','sum'),avgLegKm=('distance_km','mean'),totalCo2Kg=('co2_kg','sum')).reset_index().rename(columns={'operator':'airline'}).sort_values(['flights','totalDistanceKm'],ascending=[False,False])
    route=df.assign(route=df['from']+' → '+df['to']).groupby('route').agg(flights=('route','size'),totalDistanceKm=('distance_km','sum')).reset_index().sort_values(['flights','totalDistanceKm'],ascending=[False,False])
    airport_stats=[]
    for iata in sorted(seen): airport_stats.append({'iata':iata,'departures':int(dep.get(iata,0)),'arrivals':int(arr.get(iata,0)),'movements':int(counts.get(iata,0)),'uniqueConnections':len(set(df.loc[df['from']==iata,'to']).union(set(df.loc[df['to']==iata,'from'])))})
    first={}
    for _,r in df.sort_values('date').iterrows():
        for c in [r['from'],r['to']]: first.setdefault(c,int(r.year))
    ny={}
    for y in first.values(): ny[y]=ny.get(y,0)+1
    valid=df.dropna(subset=['distance_km']).assign(route=df['from']+' → '+df['to'])
    stats={'totals':{'flights':len(df),'distanceKm':float(df.distance_km.dropna().sum()),'co2Kg':float(df.co2_kg.dropna().sum()),'uniqueAirports':len(seen),'years':sorted([int(x) for x in df.year.dropna().unique()]),'months':sorted(df.month.dropna().unique().tolist()),'airlines':sorted(df.operator.fillna('Unknown').unique().tolist())},'airlines':airline.to_dict('records'),'routes':route.head(100).to_dict('records'),'airports':sorted(airport_stats,key=lambda x:x['movements'],reverse=True),'newAirportsPerYear':[{'year':k,'newAirports':v} for k,v in sorted(ny.items())],'longestFlights':valid.sort_values('distance_km',ascending=False).head(10)[['date_str','route','operator','distance_km','co2_kg']].rename(columns={'date_str':'date','distance_km':'distanceKm','co2_kg':'co2Kg'}).to_dict('records'),'shortestFlights':valid.sort_values('distance_km').head(10)[['date_str','route','operator','distance_km','co2_kg']].rename(columns={'date_str':'date','distance_km':'distanceKm','co2_kg':'co2Kg'}).to_dict('records')}
    for name,obj in {'flights.json':flights,'routes.geojson':{'type':'FeatureCollection','features':route_feats},'airports.geojson':{'type':'FeatureCollection','features':ap_feats},'stats.json':stats}.items(): (out/name).write_text(json.dumps(obj,ensure_ascii=False,indent=2),encoding='utf-8')
    print(f'Processed {len(df)} flights. Wrote {out}')
if __name__=='__main__': main()
