import asyncio,json,websockets,time
async def m():
  async with websockets.connect("wss://mainnet-ws1.bulk.trade") as w:
    await w.send(json.dumps({"method":"subscribe","subscription":[{"type":"ticker","symbol":"BTC-USD"},{"type":"trades","symbol":"BTC-USD"},{"type":"risk","symbol":"BTC-USD"}]}))
    t=time.time(); seen={}
    while time.time()-t<12:
      try: msg=await asyncio.wait_for(w.recv(),3)
      except asyncio.TimeoutError: continue
      d=json.loads(msg); k=d.get("type"); seen[k]=seen.get(k,0)+1
      if seen[k]<=1: print(msg[:900])
    print(seen)
asyncio.run(m())
