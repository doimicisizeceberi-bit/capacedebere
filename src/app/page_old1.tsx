"use client"

import { supabase } from '../lib/supabaseClient'
import { useEffect, useState } from 'react'

type BeerCap = {
  id: number
  beer_name: string
  cap_no: number
  issued_year: number
  sheet: string
  trade_type: string
  cap_country_name: string
  source_name: string
}

export default function Home() {
  const [caps, setCaps] = useState<BeerCap[]>([])

  useEffect(() => {
    const fetchCaps = async () => {
      const { data, error } = await supabase
  .from('beer_caps')
  .select(`
			id,
			beer_name,
			cap_no,
			issued_year,
			sheet,
			trade_type,
			caps_country!inner (country_name_full),
			caps_sources!inner (source_name)
		  `)
  .order('id', { ascending: true })
	if (error) {
        console.error('Error fetching beer caps:', error)
      } else {
        const formatted = data.map((item: any) => ({
		  id: item.id,
		  beer_name: item.beer_name,
		  cap_no: item.cap_no,
		  issued_year: item.issued_year,
		  sheet: item.sheet,
		  trade_type: item.trade_type,
		  cap_country_name: item.caps_country?.country_name_full ?? '',
		  source_name: item.caps_sources?.source_name ?? ''
		}))

        setCaps(formatted)
      }
    }

    fetchCaps()
  }, [])

  return (
    <main style={{ padding: '2rem' }}>
      <h1>My Beer Caps Collection</h1>

      <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: '1rem' }}>
        <thead>
          <tr style={{ borderBottom: '2px solid black' }}>
            <th style={{ padding: '0.5rem', textAlign: 'left' }}>ID</th>
            <th style={{ padding: '0.5rem', textAlign: 'left' }}>Beer Name</th>
            <th style={{ padding: '0.5rem', textAlign: 'left' }}>Cap No</th>
            <th style={{ padding: '0.5rem', textAlign: 'left' }}>Country</th>
            <th style={{ padding: '0.5rem', textAlign: 'left' }}>Issued Year</th>
            <th style={{ padding: '0.5rem', textAlign: 'left' }}>Sheet</th>
            <th style={{ padding: '0.5rem', textAlign: 'left' }}>Trade Type</th>
            <th style={{ padding: '0.5rem', textAlign: 'left' }}>Source</th>
          </tr>
        </thead>
        <tbody>
          {caps.map(cap => (
            <tr key={cap.id} style={{ borderBottom: '1px solid #ccc' }}>
              <td style={{ padding: '0.5rem', textAlign: 'left' }}>{cap.id}</td>
              <td style={{ textAlign: 'left' }}>{cap.beer_name}</td>
              <td style={{ textAlign: 'left' }}>{cap.cap_no}</td>
              <td style={{ textAlign: 'left' }}>{cap.cap_country_name}</td>
              <td style={{ textAlign: 'left' }}>{cap.issued_year}</td>
              <td style={{ textAlign: 'left' }}>{cap.sheet}</td>
              <td style={{ textAlign: 'left' }}>{cap.trade_type}</td>
              <td style={{ textAlign: 'left' }}>{cap.source_name}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </main>
  )
}
