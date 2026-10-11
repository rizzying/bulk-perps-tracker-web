import asyncio,json,websockets,time
async def m():
  async with websockets.connect("wss://mainnet-ws1.bulk.trade") as w:
    await w.send(json.dumps({"method":"subscribe","subscription":[{"type":"account","user":"B63A9TNQmBxSeWyzasS9ke2n1yyhsXsfvLPGrzpb2Q3w"}]}))
    t=time.time(); seen={}
    while time.time()-t<15:
      try: msg=await asyncio.wait_for(w.recv(),3)
      except asyncio.TimeoutError: continue
      d=json.loads(msg); k=d.get("type")+"/"+str((d.get("data") or {}).get("type")); seen[k]=seen.get(k,0)+1
      if seen[k]<=1: open("fixtures/ws_"+k.replace("/","_")+".json","w").write(msg); print(msg[:700])
    print(seen)
asyncio.run(m())
