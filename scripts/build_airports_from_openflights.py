
import argparse, pandas as pd
p=argparse.ArgumentParser(); p.add_argument('--input',default='data/airports.dat'); p.add_argument('--output',default='data/airports.csv'); a=p.parse_args()
cols=['id','name','city','country','iata','icao','lat','lon','alt','tz','dst','tz_db','type','source']
df=pd.read_csv(a.input,header=None,names=cols)[['iata','name','city','country','lat','lon']].dropna(subset=['iata','lat','lon'])
df['iata']=df['iata'].astype(str).str.upper(); df=df[df.iata.str.len()==3].drop_duplicates('iata'); df.to_csv(a.output,index=False); print('Wrote',a.output)
