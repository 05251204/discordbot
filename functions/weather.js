async function weather(){
  try{
    const url="https://weather.tsukumijima.net/api/forecast/city/130010";
    const weatherResult=(await fetch(url));
    const jsondata=await weatherResult.json();
    const data=jsondata["forecasts"][0];
    const extracted = {
      dateLabel: data.dateLabel,
      telop: data.telop,
      detail: data.detail,
      temperature: data.temperature,
      chanceOfRain: data.chanceOfRain
    };
    return extracted;
  }
  catch(error){
    return "error:weather.js/weather";
  }
}

console.log(await weather());
export { weather };
