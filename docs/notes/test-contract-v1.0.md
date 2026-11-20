# Test Contract v1.0: tóm tắt để code (nguồn: lab board, tab Phase 1)

- **CLI:** `<headless_cmd> --seed <int> --night 1 [--scenario f] [--inputs f] --ticks <int> --out f.jsonl [--snapshot-every n=10]`. 60 tick/s, không cửa sổ. Dừng khi đủ ticks hoặc game kết thúc → exit 0. Lỗi → exit ≠ 0 kèm stderr. File inputs/scenario sai định dạng → **exit 2**.
- **Đơn vị:** mét, trục Y hướng lên, mặt đất Y = 0, người chơi bắt đầu ở (0,0,0). Khoảng cách tính trên mặt phẳng XZ; "trong r" nghĩa là ≤ r. `player.pos` là chân; `shade.pos` là tâm; `lantern.pos` là chân cột; đom đóm nằm trên mặt đất.
- **Tick:** snapshot 0 là trạng thái sau setup, trước input. Bước k đọc input của tick k và tạo trạng thái k+1; event gắn `tick = k+1`. `time_left_s = duration − steps/60`.
- **Inputs:** `frames[]` có `tick` tăng nghiêm ngặt. Mặc định: `move [0,0]`, `cam_yaw_deg 0`, các nút false. Trường vắng mặt giữ giá trị cũ. Vector `move` dài hơn 1 thì chuẩn hóa. Với θ = yaw: `x' = x·cosθ + z·sinθ`, `z' = −x·sinθ + z·cosθ`. Nút `jump`/`interact`/`pulse`/`dash` kích hoạt khi chuyển false → true.
- **Scenario:** `player{pos,carried,flames}`, `random_motes`, `random_shades` (false = chỉ có những gì được liệt kê), `motes[[x,y,z]]` và `shades[{pos,id?}]` thay thế danh sách mặc định, `lanterns[{id,pos?,deposited?,lit?}]` cập nhật theo id L1..L5, `time_left_s`. Setup không phát event, không cộng điểm.
- **Snapshot:** `type, tick, sim_tick, state, time_left_s, score, player{pos,flames,carried}, lanterns[{id,pos,lit,deposited}], shades[{id,pos,state}], motes_active`, và khuyến nghị thêm `motes[{id,pos}]`.
- **Event:** `mote_picked{carried}`, `deposit{lantern_id,amount,deposited}`, `lantern_lit{lantern_id}`, `pulse{stunned_ids}`, `player_hit{by,flames,dropped}`, `shade_spawned{id}`, `game_over{result,reason: all_lit|dawn|no_flames}`.
- **End:** `{type:"end", ticks, state, score}`, là dòng cuối, bắt buộc. Tọa độ làm tròn 3 chữ số. Shade state phải có `stunned`.
- **Tất định:** cùng seed + scenario + inputs → output giống từng byte, kể cả id.
