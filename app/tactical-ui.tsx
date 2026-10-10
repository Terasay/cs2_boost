"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { ArrowUpRight, Crosshair, Timer } from "lucide-react";
import { ratingLimits, type Price } from "@/lib/pricing.mjs";

export function Brand({ href }: { href: string }) {
  return <a href={href} className="brand" aria-label="CS2 Boost"><span className="brand-mark" aria-hidden="true"><svg viewBox="0 0 30 30" fill="none"><path d="m3 6 8 9-8 9M14 6l8 9-8 9" stroke="currentColor" strokeWidth="3"/></svg></span><span className="brand-word">CS2<strong>BOOST</strong></span><i aria-hidden="true">/</i></a>;
}

export function AnimatedNumber({ value, ru = true, currency = false }: { value: number; ru?: boolean; currency?: boolean }) {
  const [display, setDisplay] = useState(value);
  const previous = useRef(value);
  useEffect(() => {
    const from = previous.current;
    const start = performance.now();
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let frame: number;
    const tick = (now: number) => {
      const progress = reduced ? 1 : Math.min((now - start) / 280, 1);
      const next = from + (value - from) * (1 - Math.pow(1 - progress, 3));
      previous.current = next;
      setDisplay(next);
      if (progress < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [value]);
  const formatter = new Intl.NumberFormat(ru ? "ru-RU" : "en-US", currency ? { style: "currency", currency: "RUB", maximumFractionDigits: 2 } : { maximumFractionDigits: 0 });
  return <><span aria-hidden="true">{formatter.format(display)}</span><span className="sr-only">{formatter.format(value)}</span></>;
}

export function RatingControl({ id, label, value, onChange, platform, target, minimum, ru }: { id: string; label: string; value: string; onChange: (value: string) => void; platform: "premier" | "faceit"; target?: boolean; minimum?: number; ru: boolean }) {
  const number = Number(value) || 0;
  const limits = ratingLimits[platform];
  const max = target ? limits.maxTarget : limits.maxTarget - limits.minIncrease;
  const min = target ? Math.min(max, Math.max(limits.minIncrease, minimum ?? limits.minIncrease)) : 0;
  const color = platform === "faceit" ? "#f59b23" : number >= 20000 ? "#e35858" : number >= 15000 ? "#bd88f3" : number >= 10000 ? "#729af2" : "#8ba8bb";
  return <div className={`rating-module${target ? " is-target" : ""}`} style={{ "--rating-fill": `${max === min ? 100 : Math.max(0, Math.min(100, (number - min) / (max - min) * 100))}%`, "--rating-color": color } as CSSProperties}>
    <label htmlFor={id}><span>{target ? "02" : "01"}</span>{label}</label>
    <div className="rating-value"><input id={id} type="number" min={min} max={max} step={1} inputMode="numeric" value={value} onChange={event => onChange(event.target.value)} aria-describedby="rating-limits" placeholder={platform === "premier" ? (target ? "10000" : "4500") : (target ? "1500" : "1000")}/><small>{platform === "premier" ? (ru ? "РЕЙТИНГ" : "RATING") : "ELO"}</small></div>
    <input className="rating-slider" type="range" min={min} max={max} step={1} value={Math.min(max, Math.max(min, number))} onChange={event => onChange(event.target.value)} aria-describedby="rating-limits" aria-label={ru ? `${label} — ползунок` : `${label} slider`}/>
    <div className="rating-scale"><span>{new Intl.NumberFormat(ru ? "ru-RU" : "en-US").format(min)}</span><span>{new Intl.NumberFormat(ru ? "ru-RU" : "en-US").format(max)}</span></div>
  </div>;
}

export function ObjectiveHud({ platform, current, target, method, price, ru, calibration = false }: { platform: "premier" | "faceit"; current: string; target: string; method: string; price: Price | null; ru: boolean; calibration?: boolean }) {
  const ready = price?.totalAmount != null;
  return <aside className="objective-hud" aria-label={ru ? "Текущий расчёт заказа" : "Current order estimate"}>
    <div className="hud-heading"><Crosshair size={16}/><span>MATCH OBJECTIVE</span><span className="hud-index">/ 01</span></div>
    <div className="hud-mode"><span>{platform.toUpperCase()}</span><small>{method.toUpperCase()}</small></div>
    <div className="hud-ratings"><div><small>{ru ? "ТЕКУЩИЙ" : "CURRENT"}</small><strong>{current ? <AnimatedNumber value={Number(current)} ru={ru}/> : "—"}</strong></div><ArrowUpRight size={26}/><div><small>{ru ? "ЦЕЛЬ" : "TARGET"}</small><strong>{target ? <AnimatedNumber value={Number(target)} ru={ru}/> : "—"}</strong></div></div>
    <div className="hud-meta"><div><span>DELTA</span><b>{ready ? `+${new Intl.NumberFormat(ru ? "ru-RU" : "en-US").format(Number(target) - Number(current))}` : "—"}</b></div><div><span><Timer size={12}/> ETA</span><b>{price?.durationDays ? `${price.durationDays} ${ru ? "ДН." : "DAYS"}` : "—"}</b></div></div>
    <div className="hud-status"><span className={ready ? "signal-dot" : "signal-dot muted"}/><span>{ready ? (ru ? "РАСЧЁТ ГОТОВ" : "ESTIMATE READY") : calibration ? (ru ? "КАЛИБРОВКА" : "CALIBRATION") : (ru ? "ВЫБЕРИТЕ ЦЕЛЬ" : "SET YOUR TARGET")}</span><small>{ru ? "КАЛЬКУЛЯТОР НИЖЕ" : "CONFIGURE BELOW"}</small></div>
  </aside>;
}
