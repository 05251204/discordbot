import axios from "axios";
import { JSDOM } from "jsdom";

async function getDelayInfo() {
  try {
    const response = await axios.get("https://transit.yahoo.co.jp/diainfo/area/4");
    const dom = new JSDOM(response.data);
    const document = dom.window.document;

    const rows = document.querySelectorAll("#mdStatusTroubleLine div.elmTblLstLine.trouble table tbody tr");
    const infoList = [];
    
    // ターゲット路線の定義
    const targetLines = ["湘南新宿ライン", "上野東京ライン", "東海道本線", "宇都宮線"];

    for (const row of rows) {
      const cell = row.querySelector('td a');
      if (cell) {
        const linename = cell.textContent.trim();

        if (targetLines.some(target => linename.includes(target))) {
          const delay_url = cell.href;
          const delay_response = await axios.get("https://transit.yahoo.co.jp" + delay_url);
          const delay_dom = new JSDOM(delay_response.data);

          const delay_info = delay_dom.window.document.querySelector("#mdServiceStatus dl dd p");

          if (delay_info) {
            infoList.push(`⚠️ ${linename}: ${delay_info.textContent.trim()}`);
          }
        }
      }
    }

    if (infoList.length === 0) {
      // 遅延がない場合は空の配列ではなく、明示的に「平常運転」とわかる情報を返すか、
      // 呼び出し元で判定しやすいように空配列を返すのが一般的ですが、
      // 今回はLLMに渡すテキストとしてわかりやすい形にします。
      return ["現在、通学路線の遅延情報はありません（平常運転）。"];
    }
    
    return infoList;

  } catch (err) {
    console.error(err);
    return ["遅延情報の取得に失敗しました。"];
  }
}

export { getDelayInfo };