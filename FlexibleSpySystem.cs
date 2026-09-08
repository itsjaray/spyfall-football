using System;
using System.Collections.Generic;
using System.Text.RegularExpressions;
using UnityEngine;

[Serializable]
public class PlayerData
{
    public int id;
    public string name;
    public string[] aliases;
    public string position;
    public string foot;
}

public class FlexibleSpySystem : MonoBehaviour
{
    // ฟังก์ชันแปลงข้อความให้เป็นมาตรฐาน (ตัวพิมพ์เล็ก + ตัดเว้นวรรคและอักขระพิเศษ)
    private string NormalizeText(string text)
    {
        if (string.IsNullOrEmpty(text)) return "";
        return Regex.Replace(text.ToLower(), @"[\s\W_]+", "");
    }

    // ฟังก์ชันหลักสำหรับตรวจสอบคำตอบของผู้เล่น
    public PlayerData CheckPlayerGuess(string userInput, List<PlayerData> playerDatabase)
    {
        string normUser = NormalizeText(userInput);
        
        // กำหนดให้ต้องพิมพ์อย่างน้อย 2 ตัวอักษรขึ้นไปถึงจะเริ่มค้นหา
        if (string.IsNullOrEmpty(normUser) || normUser.Length < 2) return null;

        foreach (var player in playerDatabase)
        {
            // รวมชื่อหลักและชื่อเล่น (aliases) เข้าด้วยกันเพื่อเช็ก
            List<string> namesToTest = new List<string> { player.name };
            if (player.aliases != null) namesToTest.AddRange(player.aliases);

            foreach (var targetName in namesToTest)
            {
                string normCorrect = NormalizeText(targetName);

                // ความยืดหยุ่นแบบ Substring: ถ้าคำที่พิมพ์ไปอยู่ในชื่อ หรือชื่อมีคำที่พิมพ์มา
                if (normCorrect.Contains(normUser) || normUser.Contains(normCorrect))
                {
                    return player; // ส่งข้อมูลนักเตะกลับไปว่า "ตอบถูก"
                }
            }
        }

        return null; // ถ้าไม่ตรงกับใครเลย
    }
}
