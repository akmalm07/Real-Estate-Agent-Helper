import { useState, useEffect } from 'react'
import './App.css'
import { BACKEND_URL } from './consts.ts'

function App() {
  
  const [test, setTest] = useState("failed")
  
  useEffect(() => {
    const fetchData = async () => {
      try {
        const res = await fetch(BACKEND_URL);
        if (!res.ok) throw new Error("Network failed"); 
        setTest("hello world!")
        const data = await res.text();
        console.log(data);
      } catch (error) {
        console.error("Fetch error:", error);
      }
    }
    
    fetchData();
  }, [] )

  
  return (
    <>
      <p>{test}</p>
    </>
  )
}

export default App
