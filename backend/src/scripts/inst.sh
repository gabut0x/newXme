#!/usr/bin/env bash

[[ "$(uname)" == "Darwin" ]] && tmptmpBUILD='1'
[[ -f /cygdrive/c/cygwin64/bin/uname && ( "$(/cygdrive/c/cygwin64/bin/uname -o)" == "Cygwin" || "$(/cygdrive/c/cygwin64/bin/uname -o)" == "Msys") ]] && tmptmpBUILD='11'
[[ "$(command -v systemd-detect-virt)" && "$(systemd-detect-virt)" == "openvz" ]] && tmptmpCTVIRTTECH='1'

[[ "$tmptmpBUILD" != "1" && "$tmptmpBUILD" != "11" ]] && [ "$(id -u)" != 0 ] && exec sudo bash -c "`cat -`" -a "$@"
[[ "$tmptmpBUILD" != "1" && "$tmptmpBUILD" != "11" ]] && [[ "$EUID" -ne '0' ]] && echo "Error:This script must be run as root!" && exit 1

forcemaintainmode='0'
export autoDEBMIRROR0=https://github.com/dGhpcy5pcy5vbmx5LmZvci5pbnN0YWxsYXRpb24/dGhpcy5pcy5mb2xkZXIucGF0aC5mb3IucHV0Lm1haW4uZmlsZS5pbnN0YWxsYXRpb24uZmlsZX/raw/master
export autoDEBMIRROR1=''
export FORCEDEBMIRROR=''
export tmpTARGETMODE='0'
export tmpTARGET='__GZLINK__'
export setNet='0'
export AutoNet='1'
export FORCE1STNICNAME=''
export FORCENETCFGSTR=''
export FORCEPASSWORD='__PASSWD__'
export FORCENETCFGV6ONLY=''
export FORCEMIRRORIMGSIZE=''
export FORCEMIRRORIMGNOSEG=''
export FORCE1STHDNAME=''
export FORCEGRUBTYPE=''
export FORCEINSTCTL='1'
export FORCEINSTCMD=''
export tmpINSTSERIAL='0'
export tmpINSTSSHONLY='0'
export tmpCTVIRTTECH='0'
export tmpPVEREADY='0'
export tmpBUILD='0' 
export tmpBUILDGENE='0'
export tmpBUILDPUTPVEINIFS='0'
export tmpHOST=''
export HOSTMODLIST='0'
export tmpHOSTARCH='0'
export custIMGSIZE='10'
export custUSRANDPASS='tdl'
export tmpTGTNICNAME='eth0'
export tmpTGTNICIP='111.111.111.111'
export tmpWIFICONNECT='CMCC-xxx,11111111,wlan0'
export GENCLIENTS='y'
export GENCLIENTSWINOSX='n'
export PACKCLIENTS='n'
export tmpEBDCLIENTURL='xme.my.id'
export PACKCONTAINERS=''
export GENCONTAINERS=''
export tmpDEBUG='0'
export tmpDRYRUNREMASTER='0'
export tmpINSTWITHMANUAL='0'
export tmpINSTWITHBORE=''
export tmpINSTVNCPORT='47471'
export tmpBUILDINSTTEST='0'
export tmpBUILDADDONS='0'

function prehint0(){

  [ -d /sys/firmware/efi ] && echo -n u, || echo -n b,;
  [[ "$tmptmpBUILD" != "11" && "$tmptmpBUILD" != "1" ]] && { [[ "$(find /sys/class/net/ -type l ! -lname '*/devices/virtual/net/*' |  wc -l)" -lt 2 ]] && echo -n "i:1," || echo -n "i:>1,"; } || echo -n "i:d,"
  [[ "$tmptmpBUILD" != "11" && "$tmptmpBUILD" != "1" ]] && { [[ "$(lsblk -e 7 -e 11 -d | tail -n+2 | wc -l)" -lt 2 ]] && echo -n "p:1" || echo -n "p:>1"; } || echo -n "p:d"

}

function prehint4(){

  [[ "$tmptmpBUILD" != "1" && "$tmptmpBUILD" != "11" && "$tmptmpCTVIRTTECH" != "1" ]] && {
    DEFAULTWORKINGNIC="$(ip route show |grep -o 'default via [0-9]\{1,3\}.[0-9]\{1,3\}.[0-9]\{1,3\}.[0-9]\{1,3\}.*' |head -n1 |sed 's/proto.*\|onlink.*//g' |awk '{print $NF}')";
    [[ -z "$DEFAULTWORKINGNIC" ]] && { DEFAULTWORKINGNIC="$(ip -6 -brief route show default |head -n1 |grep -o 'dev .*'|sed 's/proto.*\|onlink.*\|metric.*//g' |awk '{print $NF}')"; };
    [[ -n "$DEFAULTWORKINGNIC" ]] && { DEFAULTWORKINGIPSUBV4="$(ip addr |grep ''${DEFAULTWORKINGNIC}'' |grep 'global' |grep 'brd\|' |head -n1 |grep -o '[0-9]\{1,3\}.[0-9]\{1,3\}.[0-9]\{1,3\}.[0-9]\{1,3\}/[0-9]\{1,2\}')";[[ -z "$DEFAULTWORKINGIPSUBV4" ]] && DEFAULTWORKINGIPSUBV4="$(ip addr |grep ''${DEFAULTWORKINGNIC}'' |grep 'global' |head -n1 |grep -o '[0-9]\{1,3\}.[0-9]\{1,3\}.[0-9]\{1,3\}.[0-9]\{1,3\}/[0-9]\{1,2\}')"; };
    DEFAULTWORKINGGATEV4="$(ip route show |grep -o 'default via [0-9]\{1,3\}.[0-9]\{1,3\}.[0-9]\{1,3\}.[0-9]\{1,3\}' |head -n1 |grep -o '[0-9]\{1,3\}.[0-9]\{1,3\}.[0-9]\{1,3\}.[0-9]\{1,3\}')";
    [[ -n "$DEFAULTWORKINGIPSUBV4" ]] && [[ -n "$DEFAULTWORKINGGATEV4" ]] && echo -n $DEFAULTWORKINGIPSUBV4,$DEFAULTWORKINGGATEV4 || echo -n 'no default working ipv4';
  };

  [[ "$tmptmpBUILD" != "1" && "$tmptmpCTVIRTTECH" != "11" && "$tmptmpCTVIRTTECH" == "1" ]] && {
    DEFAULTWORKINGNIC="$(awk '$2 == 00000000 { print $1 }' /proc/net/route)";
    [[ -n "$DEFAULTWORKINGNIC" ]] && DEFAULTWORKINGIPSUBV4="$(ip addr show dev ''${DEFAULTWORKINGNIC}'' | sed -nE '/global/s/.*inet (.+) brd.*$/\1/p' | head -n 1)";
    DEFAULTWORKINGGATEV4="locallink";
    [[ -n "$DEFAULTWORKINGIPSUBV4" ]] && [[ -n "$DEFAULTWORKINGGATEV4" ]] && echo -n $DEFAULTWORKINGIPSUBV4,$DEFAULTWORKINGGATEV4 || echo -n 'no default working ipv4';
  };

  [[ "$tmptmpBUILD" == "11" ]] && {
    DEFAULTWORKINGNICIDX="$(netsh int ipv4 show route | grep --text -F '0.0.0.0/0' | awk '$6 ~ /\./ {print $5}')";
    [[ -z "$DEFAULTWORKINGNICIDX" ]] && { DEFAULTWORKINGNICIDX="$(netsh int ipv6 show route | grep --text -F '::/0' | awk '$6 ~ /:/ {print $5}')"; };
    [[ -n "$DEFAULTWORKINGNICIDX" ]] && { for i in `echo "$DEFAULTWORKINGNICIDX"|sed 's/\ /\n/g'`; do if grep -q '=$' <<< `wmic nicconfig where "InterfaceIndex='$i'" get IPAddress /format:list|sed 's/\r//g'|sed 's/IPAddress={//g'|sed 's/\("\|}\)//g'|cut -d',' -f1`; then :; else DEFAULTWORKINGNICIDX=$i;fi;done;  };
    DEFAULTWORKINGIPV4=`echo $(wmic nicconfig where "InterfaceIndex='$DEFAULTWORKINGNICIDX'" get IPAddress /format:list|sed 's/\r//g'|sed 's/IPAddress={//g'|sed 's/\("\|}\)//g'|cut -d',' -f1)`;
    DEFAULTWORKINGGATEV4=`echo $(wmic nicconfig where "InterfaceIndex='$DEFAULTWORKINGNICIDX'"  get DefaultIPGateway /format:list|sed 's/\r//g'|sed 's/DefaultIPGateway={//g'|sed 's/\("\|}\)//g'|cut -d',' -f1)`;
    DEFAULTWORKINGMASKV4=`echo $(wmic nicconfig where "InterfaceIndex='$DEFAULTWORKINGNICIDX'" get IPSubnet /format:list|sed 's/\r//g'|sed 's/IPSubnet={//g'|sed 's/\("\|}\)//g'|cut -d',' -f1)`;
    [[ -n "$DEFAULTWORKINGIPV4" ]] && [[ -n "$DEFAULTWORKINGGATEV4" ]] && echo -n $DEFAULTWORKINGIPV4,$DEFAULTWORKINGGATEV4 || echo -n 'no default working ipv4';
  };

  [[ "$tmptmpBUILD" == "1" ]] && {
    DEFAULTWORKINGNIC="$(netstat -nr -f inet|grep default|awk '{print $4}')";
    [[ -z "$DEFAULTWORKINGNIC" ]] && { DEFAULTWORKINGNIC="$(netstat -nr -f inet6|grep default|awk '{print $4}' |head -n1)"; };
    [[ -n "$DEFAULTWORKINGNIC" ]] && DEFAULTWORKINGIPSUBV4="$(ifconfig ''${DEFAULTWORKINGNIC}'' |grep -Fv inet6|grep inet|awk '{print $2}')";
    DEFAULTWORKINGGATEV4="$(netstat -nr -f inet|grep default|grep ''${DEFAULTWORKINGNIC}'' |awk '{print $2}')";
    [[ -n "$DEFAULTWORKINGIPSUBV4" ]] && [[ -n "$DEFAULTWORKINGGATEV4" ]] && echo -n $DEFAULTWORKINGIPSUBV4,$DEFAULTWORKINGGATEV4 || echo -n 'no default working ipv4';
  };

}

function prehint61(){

  [[ "$tmptmpBUILD" != "1" && "$tmptmpBUILD" != "11" ]] && {
    DEFAULTWORKINGNIC="$(ip route show |grep -o 'default via [0-9]\{1,3\}.[0-9]\{1,3\}.[0-9]\{1,3\}.[0-9]\{1,3\}.*' |head -n1 |sed 's/proto.*\|onlink.*//g' |awk '{print $NF}')";
    [[ -z "$DEFAULTWORKINGNIC" ]] && { DEFAULTWORKINGNIC="$(ip -6 -brief route show default |head -n1 |grep -o 'dev .*'|sed 's/proto.*\|onlink.*\|metric.*//g' |awk '{print $NF}')"; };
    [[ -n "$DEFAULTWORKINGNIC" ]] && DEFAULTWORKINGIPSUBV6="$(ip -6 -brief address show scope global|grep ''${DEFAULTWORKINGNIC}'' |awk -F ' ' '{ print $3}')";
    [[ -n "$DEFAULTWORKINGIPSUBV6" ]] && echo -n $DEFAULTWORKINGIPSUBV6 || echo -n 'no default working v6ip';
  };

  [[ "$tmptmpBUILD" == "11" ]] && {
    DEFAULTWORKINGNICIDX="$(netsh int ipv6 show route | grep --text -F '::/0' | awk '$6 ~ /:/ {print $5}')";
    [[ -n "$DEFAULTWORKINGNICIDX" ]] && { for i in `echo "$DEFAULTWORKINGNICIDX"|sed 's/\ /\n/g'`; do if grep -q '=$' <<< `wmic nicconfig where "InterfaceIndex='$i'" get IPAddress /format:list|sed 's/\r//g'|sed 's/IPAddress={//g'|sed 's/\("\|}\)//g'|cut -d',' -f1`; then :; else DEFAULTWORKINGNICIDX=$i;fi;done;  };
    [[ -n "$DEFAULTWORKINGNICIDX" ]] && DEFAULTWORKINGIPV6=`echo $(wmic nicconfig where "InterfaceIndex='$DEFAULTWORKINGNICIDX'" get IPAddress /format:list|sed 's/\r//g'|sed 's/IPAddress={//g'|sed 's/\("\|}\)//g'|cut -d',' -f2)`;
    [[ -n "$DEFAULTWORKINGIPV6" ]] && echo -n $DEFAULTWORKINGIPV6 || echo -n 'no default working v6ip';
  };

  [[ "$tmptmpBUILD" == "1" ]] && {
    DEFAULTWORKINGNIC="$(netstat -nr -f inet6|grep default|awk '{print $4}' |head -n1)";
    [[ -n "$DEFAULTWORKINGNIC" ]] && DEFAULTWORKINGIPSUBV6="$(ifconfig ''${DEFAULTWORKINGNIC}'' |grep inet6|head -n1|awk '{print $2}'|sed 's/%.*//g')";
    [[ -n "$DEFAULTWORKINGIPSUBV6" ]] && echo -n $DEFAULTWORKINGIPSUBV6 || echo -n 'no default working v6ip';
  };

}

function prehint62(){

  [[ "$tmptmpBUILD" != "1" && "$tmptmpBUILD" != "11" ]] && {
    DEFAULTWORKINGNIC="$(ip route show |grep -o 'default via [0-9]\{1,3\}.[0-9]\{1,3\}.[0-9]\{1,3\}.[0-9]\{1,3\}.*' |head -n1 |sed 's/proto.*\|onlink.*//g' |awk '{print $NF}')";
    [[ -z "$DEFAULTWORKINGNIC" ]] && { DEFAULTWORKINGNIC="$(ip -6 -brief route show default |head -n1 |grep -o 'dev .*'|sed 's/proto.*\|onlink.*\|metric.*//g' |awk '{print $NF}')"; };
    [[ -n "$DEFAULTWORKINGNIC" ]] && DEFAULTWORKINGGATEV6="$(ip -6 -brief route show default|grep ''${DEFAULTWORKINGNIC}'' |awk -F ' ' '{ print $3}')";
    [[ -n "$DEFAULTWORKINGGATEV6" ]] && echo -n $DEFAULTWORKINGGATEV6 || echo -n 'no default working v6gate';
  };

  [[ "$tmptmpBUILD" == "11" ]] && {
    DEFAULTWORKINGNICIDX="$(netsh int ipv6 show route | grep --text -F '::/0' | awk '$6 ~ /:/ {print $5}')";
    [[ -n "$DEFAULTWORKINGNICIDX" ]] && { for i in `echo "$DEFAULTWORKINGNICIDX"|sed 's/\ /\n/g'`; do if grep -q '=$' <<< `wmic nicconfig where "InterfaceIndex='$i'" get IPAddress /format:list|sed 's/\r//g'|sed 's/IPAddress={//g'|sed 's/\("\|}\)//g'|cut -d',' -f1`; then :; else DEFAULTWORKINGNICIDX=$i;fi;done;  };
    [[ -n "$DEFAULTWORKINGNICIDX" ]] && DEFAULTWORKINGGATEV6=`echo $(wmic nicconfig where "InterfaceIndex='$DEFAULTWORKINGNICIDX'"  get DefaultIPGateway /format:list|sed 's/\r//g'|sed 's/DefaultIPGateway={//g'|sed 's/\("\|}\)//g'|cut -d',' -f2)`;
    [[ -n "$DEFAULTWORKINGGATEV6" ]] && echo -n $DEFAULTWORKINGGATEV6 || echo -n 'no default working v6gate';
  };

  [[ "$tmptmpBUILD" == "1" ]] && {
    DEFAULTWORKINGNIC="$(netstat -nr -f inet6|grep default|awk '{print $4}' |head -n1)";
    [[ -n "$DEFAULTWORKINGNIC" ]] && DEFAULTWORKINGGATEV6="$(netstat -nr -f inet6|grep default|grep ''${DEFAULTWORKINGNIC}'' |awk '{ print $2}'|sed 's/%.*//g')";
    [[ -n "$DEFAULTWORKINGGATEV6" ]] && echo -n $DEFAULTWORKINGGATEV6 || echo -n 'no default working v6gate';
  };

}

function CheckDependence(){

  [[ "$tmpDEBUG" == "2" ]] && echo -en "[ \033[32m 3rd rescue,assume preinstalled \033[0m ]" && return;
  [[ "$tmpBUILD" == "11" || "$tmpBUILD" == "1" ]] && echo -en "[ \033[32m non linux,assume preinstalled \033[0m ]" && return;

  FullDependence='0';
  lostdeplist="";
  lostpkglist="";

  for BIN_DEP in `[[ "$tmpBUILD" -ne '0' ]] && echo "$1" |sed 's/,/\n/g' || echo "$1" |sed 's/,/\'$'\n''/g'`
    do
      if [[ -n "$BIN_DEP" ]]; then
        Founded='1';
        for BIN_PATH in `[[ "$tmpBUILD" -ne '0' ]] && echo "$PATH" |sed 's/:/\n/g' || echo "$PATH" |sed 's/:/\'$'\n''/g'`
          do
            ls $BIN_PATH/$BIN_DEP >/dev/null 2>&1;
            if [ $? == '0' ]; then
              Founded='0';
              break;
            fi
          done
        [[ "$tmpTARGET" == 'devdeskos' && "$tmpTARGETMODE" == '1' && "$tmpBUILD" != '1' ]]  && echo -en "\033[s[ \033[32m ${BIN_DEP:0:10}";
        if [ "$Founded" == '0' ]; then
          [[ "$tmpTARGET" == 'devdeskos' && "$tmpTARGETMODE" == '1' && "$tmpBUILD" != '1' ]]  && echo -en ",ok  \033[0m ]\033[u";
          :;
        else
          FullDependence='1';
          [[ "$tmpTARGET" == 'devdeskos' && "$tmpTARGETMODE" == '1' && "$tmpBUILD" != '1' ]]  && echo -en ",\033[31m miss \033[0m] ";
          lostdeplist+=" $BIN_DEP";
        fi
      fi
  done

  [[ $lostdeplist =~ "sudo" ]] && lostpkglist+=" sudo"; \
  [[ $lostdeplist =~ "curl" ]] && lostpkglist+=" curl"; \
  [[ $lostdeplist =~ "ar" ]] && lostpkglist+=" binutils"; \
  [[ $lostdeplist =~ "cpio" ]] && lostpkglist+=" cpio"; \
  [[ $lostdeplist =~ "xzcat" ]] && lostpkglist+=" xz-utils"; \
  [[ $lostdeplist =~ "md5sum" || $lostdeplist =~ "sha1sum" || $lostdeplist =~ "sha256sum" || $lostdeplist =~ "df" ]] && lostpkglist+=" coreutils"; \
  [[ $lostdeplist =~ "losetup" ]] && lostpkglist+=" util-linux"; \
  [[ $lostdeplist =~ "fdisk" ]] && lostpkglist+=" fdisk"; \
  [[ $lostdeplist =~ "parted" ]] && lostpkglist+=" parted"; \
  [[ $lostdeplist =~ "mkfs.fat" ]] && lostpkglist+=" dosfstools"; \
  [[ $lostdeplist =~ "squashfs" ]] && lostpkglist+=" squashfs-tools"; \
  [[ $lostdeplist =~ "sqlite3" ]] && lostpkglist+=" sqlite3"; \
  [[ $lostdeplist =~ "unzip" ]] && lostpkglist+=" unzip"; \
  [[ $lostdeplist =~ "zip" ]] && lostpkglist+=" zip"; \
  [[ $lostdeplist =~ "7z" ]] && lostpkglist+=" p7zip"; \
  [[ $lostdeplist =~ "openssl" ]] && lostpkglist+=" openssl"; \
  [[ $lostdeplist =~ "virt-what" ]] && lostpkglist+=" virt-what"; \
  [[ $lostdeplist =~ "rsync" ]] && lostpkglist+=" rsync"; \
  [[ $lostdeplist =~ "qemu-img" ]] && lostpkglist+=" qemu-utils";

  [[ "$tmpTARGETMODE" == '0' && "$tmpBUILD" != '1' ]] && [[ ! -f /usr/sbin/grub-reboot && ! -f /usr/sbin/grub2-reboot ]] && FullDependence='1' && lostdeplist+="grub2-common"  && lostpkglist+=" grub2-common"
  [[ "$tmpTARGETMODE" == '0' && "$tmpBUILD" != '1' ]] && [[ "$FORCENETCFGV6ONLY" == '1' ]] && [[ ! -f /usr/bin/subnetcalc ]] && FullDependence='1' && lostdeplist+="subnetcalc"  && lostpkglist+=" subnetcalc"

  if [ "$FullDependence" == '1' ]; then
    echo -en "[ \033[32m deps missing! perform autoinstall \033[0m ] ";
    if [[ $(command -v yum) && ! $(command -v apt-get) ]]; then
    yum update >/dev/null 2>&1
    yum reinstall `echo -n "$lostpkglist"` -y >/dev/null 2>&1
    [[ $? == '0' ]] && echo -en "[ \033[32m done. \033[0m ]" || { echo;echo -en "\033[31m $lostdeplist missing !error happen while autoinstall! please fix to run 'yum update && yum install $lostpkglist ' to install them\033[0m";exit 1; }
    fi
    if [[ ! $(command -v yum) && $(command -v apt-get) ]]; then
    apt-get update --allow-releaseinfo-change --allow-unauthenticated --allow-insecure-repositories -y -qq  >/dev/null 2>&1
    apt-get reinstall --no-install-recommends -y -qq `echo -n "$lostpkglist"` >/dev/null 2>&1
    [[ $? == '0' ]] && echo -en "[ \033[32m done. \033[0m ]" || { echo;echo -en "\033[31m $lostdeplist missing !error happen while autoinstall! please fix to run 'apt-get update && apt-get install $lostpkglist ' to install them\033[0m";exit 1; }
    fi
  else
    [[ "$tmpTARGETMODE" != '1' ]] && echo -en "[ \033[32m all,ok \033[0m ]";
  fi
}

function test_mirror() {

  SAMPLES=1
  BYTES=511999 #0.5mb
  TIMEOUT=5
  TESTFILE="/_build/1mtest"

  for s in $(seq 1 $SAMPLES) ; do
    # CheckPass1
    downloaded=$(curl -k -L -r 0-$BYTES --max-time $TIMEOUT --silent --output /dev/null --write-out %{size_download} ${1}${TESTFILE})
    if [ "$downloaded" == "0" ] ; then
      break
    else
      # CheckPass2
      time=$(curl -k -L -r 0-$BYTES --max-time $TIMEOUT --silent --output /dev/null --write-out %{time_total} ${1}${TESTFILE})
      echo $time
    fi
  done

}

function mean() {
  len=$#
  echo $* | tr " " "\n" | sort -n | head -n $(((len+1)/2)) | tail -n 1
}

osxbash_set_avar() { eval "$1_$2=\$3"; }
_get_avar() { eval "_AVAR=\$$1_$2"; }
osxbash_get_avar() { _get_avar "$@" && printf "%s\n" "$_AVAR"; }

function SelectDEBMirror(){

  [ $# -ge 1 ] || exit 1

  [[ "$tmpBUILD" != "1" ]] && {
  declare -A MirrorTocheck
  MirrorTocheck=(["Debian0"]="" ["Debian1"]="" ["Debian2"]="")
  
  echo "$1" |sed 's/\ //g' |grep -q '^http://\|^https://\|^ftp://' && MirrorTocheck[Debian0]=$(echo "$1" |sed 's/\ //g');
  echo "$2" |sed 's/\ //g' |grep -q '^http://\|^https://\|^ftp://' && MirrorTocheck[Debian1]=$(echo "$2" |sed 's/\ //g');

  for mirror in `[[ "$tmpBUILD" -ne '0' ]] && echo "${!MirrorTocheck[@]}" |sed 's/\ /\n/g' |sort -n |grep "^Debian" || echo "${!MirrorTocheck[@]}" |sed 's/\ /\'$'\n''/g' |sort -n |grep "^Debian"`
    do
      CurMirror="${MirrorTocheck[$mirror]}"

      [ -n "$CurMirror" ] || continue

      mean=$(mean $(test_mirror $CurMirror))
      if [ "$mean" != "-nan" -a "$mean" != "" ] ; then
        LC_ALL=C printf '%-60s %.5f\\n' $CurMirror $mean
      fi

    done
  }

  [[ "$tmpBUILD" == "1" ]] && {
  osxbash_set_avar MirrorTocheck 1 $1
  osxbash_set_avar MirrorTocheck 2 $2
  osxbash_set_avar MirrorTocheck 3 $3
  for mirror in 1 2 3;do
  CurMirror=`osxbash_get_avar MirrorTocheck "$mirror"`
  [ -n "$CurMirror" ] || continue
  mean=$(mean $(test_mirror $CurMirror))
      if [ "$mean" != "-nan" -a "$mean" != "" ] ; then
        LC_ALL=C printf '%-60s %.5f\\n' $CurMirror $mean
      fi
    done
  }

}


function CheckTargeturl(){

  IMGSIZE=''
  UNZIP=''

  IMGHEADERCHECK="$(curl -k -IsL "$1")";

  IMGSIZE=20
  [[ "$IMGSIZE" == '' ]] && echo -en " \033[31m Didnt got img size,or img too small,is there sth wrong? exit! \033[0m " && exit 1;

  [[ "$tmpTARGET" =~ ":10000" ]] && IMGTYPECHECK="nc" || IMGTYPECHECK="$(echo "$IMGHEADERCHECK"|grep -E -o '200|302'|head -n 1)";

  [[ "$IMGTYPECHECK" != '' ]] && {
    [[ "$tmpTARGETMODE" == '4' && "$tmpBUILD" != '1' ]] && [[ "$tmpTARGET" == "debianct" || "$tmpTARGET" == "devdeskct" ]] && [[ "$IMGTYPECHECK" == '200' || "$IMGTYPECHECK" == '302' ]] && UNZIP='2' && { sleep 3 && echo -en "[ \033[32m inbuilt \033[0m ]"; }
    [[ "$tmpTARGETMODE" == '0' && "$tmpBUILD" != '1' ]] && [[ "$tmpTARGET" == "devdeskos" || "$tmpTARGET" == "debian10r" ]] && [[ "$IMGTYPECHECK" == '200' || "$IMGTYPECHECK" == '302' ]] && sleep 3 && UNZIP='2' && echo -en "[ \033[32m inbuilt \033[0m ]"
    [[ "$tmpTARGETMODE" == '0' && "$IMGTYPECHECK" == 'nc' ]] && sleep 3 && UNZIP='1' && echo -en "[ \033[32m nc \033[0m ]"
    [[ "$tmpTARGETMODE" == '0' && "$tmpBUILD" != '1' ]] && [[ "$tmpTARGET" != "devdeskos" && "$tmpTARGET" != "debian10r" ]] && [[ "$IMGTYPECHECK" == '200' || "$IMGTYPECHECK" == '302' ]] && {

      IMGTYPECHECKPASS_DRTREF="$(echo "$IMGHEADERCHECK"|grep -E -o 'github|raw|qcow2|application/gzip|application/x-gzip|application/x-xz|zstd'|head -n 1)";

      [[ "$IMGTYPECHECKPASS_DRTREF" == 'github' ]] && UNZIP='1' && sleep 3 && echo -en "[ \033[32m github \033[0m ]";
      [[ "$IMGTYPECHECKPASS_DRTREF" == 'raw' ]] && UNZIP='0' && sleep 3 && echo -en "[ \033[32m raw \033[0m ]";
      [[ "$IMGTYPECHECKPASS_DRTREF" == 'application/gzip' ]] && UNZIP='1' && sleep 3 && echo -en "[ \033[32m gzip \033[0m ]";
      [[ "$IMGTYPECHECKPASS_DRTREF" == 'application/x-gzip' ]] && UNZIP='1' && sleep 3 && echo -en "[ \033[32m x-gzip \033[0m ]";
      [[ "$IMGTYPECHECKPASS_DRTREF" == 'application/gunzip' ]] && UNZIP='1' && sleep 3 && echo -en "[ \033[32m gunzip \033[0m ]";
      [[ "$IMGTYPECHECKPASS_DRTREF" == 'application/x-xz' ]] && UNZIP='2' && sleep 3 && echo -en "[ \033[32m xz \033[0m ]";
      [[ "$IMGTYPECHECKPASS_DRTREF" == 'zstd' ]] && UNZIP='3' && sleep 3 && echo -en "[ \033[32m zstd \033[0m ]";
      [[ "$IMGTYPECHECKPASS_DRTREF" == 'qcow2' ]] && UNZIP='4' && sleep 3 && echo -en "[ \033[32m qcow2 \033[0m ]";
      [[ "$IMGTYPECHECKPASS_DRTREF" == '' || "$UNZIP" == '' ]] && {

        EXTCHECKPASS="$([[ $1 =~ '.' ]] && echo ${1##*.})"
        [[ "$EXTCHECKPASS" == '' ]] && { UNZIP='0' && sleep 3 && echo -en "[ \033[32m noext \033[0m ]"; } || { [[ "$EXTCHECKPASS" == 'raw' ]] && UNZIP='0' && sleep 3 && echo -en "[ \033[32m raw \033[0m ]";[[ "$EXTCHECKPASS" == 'gz' || "$EXTCHECKPASS" == 'gzip' ]] && UNZIP='1' && sleep 3 && echo -en "[ \033[32m gzip \033[0m ]";[[ "$EXTCHECKPASS" == 'xz' ]] && UNZIP='2' && sleep 3 && echo -en "[ \033[32m xz \033[0m ]";[[ "$EXTCHECKPASS" == 'zstd' ]] && UNZIP='3' && sleep 3 && echo -en "[ \033[32m zstd \033[0m ]";[[ "$EXTCHECKPASS" == 'qcow2' || "$EXTCHECKPASS" == 'img' ]] && UNZIP='4' && sleep 3 && echo -en "[ \033[32m qcow2 \033[0m ]"; }
      }

      [[ "$UNZIP" == '' ]] && UNZIP='1' && echo -en "[ \033[32m failover \033[0m ]";
    }
  }

  [[ "$tmpTARGETMODE" == '0' && "$tmpBUILD" != '1' ]] && [[ "$IMGTYPECHECK" == '' ]] && echo -en " \033[31m targeturl broken, will exit! \033[0m " && { [[ "$tmpTARGET" == "debian10r" ]] && echo -en " \033[31m debian10r image src may in maintain mode for 10-60m! \033[0m " && forcemaintainmode='1';exit 1; }
  
}

ipNum()
{
  local IFS='.';
  read ip1 ip2 ip3 ip4 <<<"$1";
  echo $((ip1*(1<<24)+ip2*(1<<16)+ip3*(1<<8)+ip4));
}

SelectMax(){
  ii=0;
  for IPITEM in `route -n |awk -v OUT=$1 '{print $OUT}' |grep '[0-9]\{1,3\}.[0-9]\{1,3\}.[0-9]\{1,3\}.[0-9]\{1,3\}'`
    do
      NumTMP="$(ipNum $IPITEM)";
      eval "arrayNum[$ii]='$NumTMP,$IPITEM'";
      ii=$[$ii+1];
    done
  echo ${arrayNum[@]} |sed 's/\s/\n/g' |sort -n -k 1 -t ',' |tail -n1 |cut -d',' -f2;
}

prefixlen2subnetmask(){

  echo `subnetcalc $TMPIPSUBV6 2>/dev/null  |grep  Netmask|cut -d "=" -f 2|sed 's/ //g'`

}

tweakall(){
  [[ -f /etc/resolv.conf ]] && {
    [[ ! -f /etc/resolv.conf.old ]] && {
      cp -f /etc/resolv.conf /etc/resolv.conf.old && > /etc/resolv.conf && echo -e 'nameserver 2001:67c:2b0::4\nnameserver 2001:67c:2b0::6' >/dev/null 2>&1 >> /etc/resolv.conf;
    } || {
      cp -f /etc/resolv.conf /etc/resolv.conf.bak && > /etc/resolv.conf && echo -e 'nameserver 2001:67c:2b0::4\nnameserver 2001:67c:2b0::6' >/dev/null 2>&1 >> /etc/resolv.conf;
    };
  } || {
    [[ -f /etc/resolv.conf.old ]] && cp -f /etc/resolv.conf.old /etc/resolv.conf;
  }
  [[ -f /etc/gai.conf ]] && {
    grep -q "^precedence ::ffff:0:0/96  100" /etc/gai.conf
    [[ $? -eq '0' ]] || {
      grep -q "#precedence ::ffff:0:0/96  100" /etc/gai.conf
      [[ $? -eq '0' ]] && {
        sed -i "s|#precedence ::ffff:0:0/96  100|precedence ::ffff:0:0/96  100|" /etc/gai.conf
      } || {
        echo "precedence ::ffff:0:0/96  100" >> /etc/gai.conf
      }
    }
  } || {
    echo "precedence ::ffff:0:0/96  100" >> /etc/gai.conf
  }
}
tweakall2(){
  [[ -f /etc/resolv.conf && ! -f /etc/resolv.conf.old ]] && {
    cp -f /etc/resolv.conf /etc/resolv.conf.old && > /etc/resolv.conf && echo -e 'nameserver 2001:67c:2b0::4\nnameserver 2001:67c:2b0::6' >/dev/null 2>&1 >> /etc/resolv.conf;
  } || {
    cp -f /etc/resolv.conf /etc/resolv.conf.bak && > /etc/resolv.conf && echo -e 'nameserver 2001:67c:2b0::4\nnameserver 2001:67c:2b0::6' >/dev/null 2>&1 >> /etc/resolv.conf;
  }
  [[ -f /etc/gai.conf ]] && {
    grep -q "^precedence ::ffff:0:0/96  100" /etc/gai.conf
    [[ $? -eq '0' ]] || {
      grep -q "#precedence ::ffff:0:0/96  100" /etc/gai.conf
      [[ $? -eq '0' ]] && {
        sed -i "s|#precedence ::ffff:0:0/96  100|precedence ::ffff:0:0/96  100|" /etc/gai.conf
      } || {
        echo "precedence ::ffff:0:0/96  100" >> /etc/gai.conf
      }
    }
  } || {
    echo "precedence ::ffff:0:0/96  100" >> /etc/gai.conf
  }
}
tweakall3(){
  [[ -f /etc/resolv.conf.old ]] && cp -f /etc/resolv.conf.old /etc/resolv.conf
}

parsenetcfg(){

  sleep 2 && printf "\n ✔ %-30s" "Parsing netcfg ......"

  interface=''

  [[ -n "$FORCENETCFGSTR" || "$FORCENETCFGV6ONLY" == '1' || ( "$tmpBUILD" == '11' || "$tmpBUILD" == '1' ) || "$tmpCTVIRTTECH" == '1' ]] && setNet='1';

  [[ "$setNet" != '1' ]] && AutoNet='1'

  [[ "$setNet" != '1' ]] && [[ -f '/etc/network/interfaces' ]] && [[ ! -f '/etc/NetworkManager/NetworkManager.conf' ]] && {
    [[ -n "$(sed -n '/iface.*inet static/p' /etc/network/interfaces)" ]] && AutoNet='1' || AutoNet='2'
    [[ -n "$(sed -n '/iface.*inet manual/p' /etc/network/interfaces)" ]] && [[ -n "$(sed -n '/iface.*inet static/p' /etc/network/interfaces)" ]] && AutoNet='1'
    
    [[ -d /etc/network/interfaces.d ]] && {
      ICFGN="$(find /etc/network/interfaces.d -type f -name '*' |wc -l)" || ICFGN='0';
      [[ "$ICFGN" -ne '0' ]] && {
        for NetCFG in `ls -1 /etc/network/interfaces.d/*`
          do 
            [[ -n "$(cat $NetCFG | sed -n '/iface.*inet static/p')" ]] && AutoNet='1' || AutoNet='2'
            [[ -n "$(cat $NetCFG | sed -n '/iface.*inet manual/p' /etc/network/interfaces)" ]] && [[ -n "$(cat $NetCFG | sed -n '/iface.*inet static/p' /etc/network/interfaces)" ]] && AutoNet='1'
            [[ "$AutoNet" -eq '0' ]] && break;
          done
      }
    }
  } || {
    [[ -f '/etc/NetworkManager/NetworkManager.conf' ]] && [[ -n "$(sed -n '/managed=false/p' /etc/NetworkManager/NetworkManager.conf)" ]] && {
      for NetCFG in /etc/NetworkManager/system-connections/*; do
        if awk '
          /\[ipv4\]/ {in_ipv4=1} 
          /\[ipv6\]/ {in_ipv4=0} 
          in_ipv4 && /method=(manual|static)/ {found=1; exit}
          END {exit !found}' "$NetCFG"; then
          AutoNet='1'
          break
        else
          AutoNet='2'
        fi
      done
    }
  }

  WORKYML=`[[ -e "/etc/netplan" ]] && find /etc/netplan* -maxdepth 1 -mindepth 1 -name *.yaml | head -n1`
  [[ "$setNet" != '1' ]] && [[ -f "$WORKYML" ]] && {
    [[ -z "$(sed -n '/dhcp4: false\|- \([0-9]\{1,3\}\.\)\{3\}[0-9]\{1,3\}.../p' $WORKYML)" ]] && AutoNet='2' || AutoNet='1'
  }

  [[ "$tmpBUILD" != '11' && "$tmpBUILD" != '1' ]] && { if [[ -n "$FORCE1STNICNAME"  ]]; then
    IFETH=`[[ \`echo $FORCE1STNICNAME|grep -Eo ":"\` ]] && echo $FORCE1STNICNAME || echo \`ip addr show $FORCE1STNICNAME|grep link/ether | awk '{print $2}'\``
    IFETHMAC=`echo $IFETH`
  else

    DEFAULTNIC="$(ip route show |grep -o 'default via [0-9]\{1,3\}.[0-9]\{1,3\}.[0-9]\{1,3\}.[0-9]\{1,3\}.*' |head -n1 |sed 's/proto.*\|onlink.*//g' |awk '{print $NF}')";
    FORCE1STNICNAME=`echo \`ip addr show $DEFAULTNIC|grep link/ether | awk '{print $2}'\``
    IFETH=`echo $FORCE1STNICNAME`
    IFETHMAC=`echo $IFETH`
  fi; }

  [[ "$tmpBUILD" != "11" && "$tmpBUILD" != "1" && "$tmpCTVIRTTECH" != "1" ]] && {
    DEFAULTNIC="$(ip route show |grep -o 'default via [0-9]\{1,3\}.[0-9]\{1,3\}.[0-9]\{1,3\}.[0-9]\{1,3\}.*' |head -n1 |sed 's/proto.*\|onlink.*//g' |awk '{print $NF}')";
    [[ -z "$DEFAULTNIC" ]] && { DEFAULTNIC="$(ip -6 -brief route show default |head -n1 |grep -o 'dev .*'|sed 's/proto.*\|onlink.*\|metric.*//g' |awk '{print $NF}')"; }
  }

  [[ "$tmpBUILD" != "11" && "$tmpBUILD" != "1" && "$tmpCTVIRTTECH" == "1" ]] && {
    DEFAULTNIC="$(awk '$2 == 00000000 { print $1 }' /proc/net/route)";
  }

  if [[ "$tmpBUILD" == '11' && -z "$FORCE1STNICNAME" ]]; then
    FORCE1STNICIDX="$(netsh int ipv4 show route | grep --text -F '0.0.0.0/0' | awk '$6 ~ /\./ {print $5}')";[[ -n "$FORCE1STNICIDX" ]] && { for i in `echo "$FORCE1STNICIDX"|sed 's/\ /\n/g'`; do if grep -q '=$' <<< `wmic nicconfig where "InterfaceIndex='$i'" get IPAddress /format:list|sed 's/\r//g'|sed 's/IPAddress={//g'|sed 's/\("\|}\)//g'|cut -d',' -f1`; then :; else FORCE1STNICIDX=$i;fi;done;  };[[ -z "$FORCE1STNICIDX" ]] && { FORCE1STNICIDX="$(netsh int ipv6 show route | grep --text -F '::/0' | awk '$6 ~ /:/ {print $5}')";FORCE1STNICNAME=`echo $(wmic nicconfig where "InterfaceIndex='$FORCE1STNICIDX'" get MACAddress /format:list|sed 's/\r//g'|sed 's/MACAddress=//g')`; } || { FORCE1STNICNAME=`echo $(wmic nicconfig where "InterfaceIndex='$FORCE1STNICIDX'" get MACAddress /format:list|sed 's/\r//g'|sed 's/MACAddress=//g')`; }
    DEFAULTNIC="$FORCE1STNICIDX";
    IFETH=`echo $FORCE1STNICNAME`
    IFETHMAC=`echo $IFETH`
  fi
  if [[ "$tmpBUILD" == '1' && -z "$FORCE1STNICNAME" ]]; then
    DEFAULTNIC="$(netstat -nr -f inet|grep default|awk '{print $4}')";[[ -z "$DEFAULTNIC" ]] && { DEFAULTNIC="$(netstat -nr -f inet6|grep default|awk '{print $4}' |head -n1)"; }
    FORCE1STNICNAME=`echo $(ifconfig ''${DEFAULTNIC}'' | awk '/ether/{print $2}')`
    IFETH=`echo $FORCE1STNICNAME`
    IFETHMAC=`echo $IFETH`
  fi

  [[ "$setNet" == '1' ]] && {

    [[ `echo "$FORCENETCFGSTR" | grep -Eo ,|wc -l` == 1 ]] && { 
      FIPSUB=`echo "$FORCENETCFGSTR" | awk -F ',' '{ print $1}'`;
      FIP="$(echo -n "$FIPSUB" |cut -d'/' -f1)";
      FCIDR="/$(echo -n "$FIPSUB" |cut -d'/' -f2)";
      [[ `echo $FIP|grep -Eo ":"` ]] && FMASK=`echo \`subnetcalc $FIPSUB 2>/dev/null  |grep  Netmask|cut -d "=" -f 2|sed 's/ //g'\`` || FMASK="$(echo -n '128.0.0.0/1,192.0.0.0/2,224.0.0.0/3,240.0.0.0/4,248.0.0.0/5,252.0.0.0/6,254.0.0.0/7,255.0.0.0/8,255.128.0.0/9,255.192.0.0/10,255.224.0.0/11,255.240.0.0/12,255.248.0.0/13,255.252.0.0/14,255.254.0.0/15,255.255.0.0/16,255.255.128.0/17,255.255.192.0/18,255.255.224.0/19,255.255.240.0/20,255.255.248.0/21,255.255.252.0/22,255.255.254.0/23,255.255.255.0/24,255.255.255.128/25,255.255.255.192/26,255.255.255.224/27,255.255.255.240/28,255.255.255.248/29,255.255.255.252/30,255.255.255.254/31,255.255.255.255/32' |grep -o '[0-9]\{1,3\}.[0-9]\{1,3\}.[0-9]\{1,3\}.[0-9]\{1,3\}'${FCIDR}'' |cut -d'/' -f1)";
      FGATE=`echo "$FORCENETCFGSTR" | awk -F ',' '{ print $2}'`;
      [[ `echo $FIP|grep -Eo ":"` ]] && tweakall;
    }
    [[ `echo "$FORCENETCFGSTR" | grep -Eo ,|wc -l` == 2 ]] && { 
      FIP=`echo "$FORCENETCFGSTR" | awk -F ',' '{ print $1}'`
      FMASK=`echo "$FORCENETCFGSTR" | awk -F ',' '{ print $2}'`
      FGATE=`echo "$FORCENETCFGSTR" | awk -F ',' '{ print $3}'`
      [[ `echo $FIP|grep -Eo ":"` ]] && tweakall;
    }

    [[ "$FORCENETCFGV6ONLY" == '1' && -z "$FORCENETCFGSTR" ]] && { [[ -n "$DEFAULTNIC" ]] && TMPIPSUBV6="$(ip -6 -brief address show scope global|grep ''${DEFAULTNIC}'' |awk -F ' ' '{ print $3}')";
    FIP="$(echo -n "$TMPIPSUBV6" |cut -d'/' -f1)";
    TMPCIDRV6="$(echo -n "$TMPIPSUBV6" |cut -d'/' -f2)";
    FGATE="$(ip -6 -brief route show default|grep ''${DEFAULTNIC}'' |awk -F ' ' '{ print $3}')";
    [[ -n "$TMPCIDRV6" ]] && FMASK="$(prefixlen2subnetmask)"; } && FORCENETCFGSTR="$FIP,$FMASK,$FGATE" && { tweakall2; }

    [[ "$tmpCTVIRTTECH" == '1' && -z "$FORCENETCFGSTR" ]] && { [[ -n "$DEFAULTNIC" ]] && TMPIPSUBV4="$(ip addr show dev ''${DEFAULTNIC}'' | sed -nE '/global/s/.*inet (.+) brd.*$/\1/p' | head -n 1)";
    FIP="$(echo -n "$TMPIPSUBV4" |cut -d'/' -f1)";
    TMPCIDRV4="$(echo -n "$TMPIPSUBV4" |grep -o '/[0-9]\{1,2\}')";
    FGATE="locallink";
    [[ -n "$TMPCIDRV4" ]] && FMASK="$(echo -n '128.0.0.0/1,192.0.0.0/2,224.0.0.0/3,240.0.0.0/4,248.0.0.0/5,252.0.0.0/6,254.0.0.0/7,255.0.0.0/8,255.128.0.0/9,255.192.0.0/10,255.224.0.0/11,255.240.0.0/12,255.248.0.0/13,255.252.0.0/14,255.254.0.0/15,255.255.0.0/16,255.255.128.0/17,255.255.192.0/18,255.255.224.0/19,255.255.240.0/20,255.255.248.0/21,255.255.252.0/22,255.255.254.0/23,255.255.255.0/24,255.255.255.128/25,255.255.255.192/26,255.255.255.224/27,255.255.255.240/28,255.255.255.248/29,255.255.255.252/30,255.255.255.254/31,255.255.255.255/32' |grep -o '[0-9]\{1,3\}.[0-9]\{1,3\}.[0-9]\{1,3\}.[0-9]\{1,3\}'${TMPCIDRV4}'' |cut -d'/' -f1)"; } && { FORCENETCFGSTR="$FIP,$FMASK,$FGATE";echo -e "auto lo\niface lo inet loopback\n\nauto $DEFAULTNIC\niface $DEFAULTNIC inet static\naddress $TMPIPSUBV4\nup route add $(ip route show default 0.0.0.0/0 | sed -E 's/^(.*dev [^ ]+).*$/\1/')\n\nhostname $(hostname)" >/dev/null 2>&1 >> $remasteringdir/ctrnet;echo -e "nameserver 8.8.8.8\nnameserver 2001:4860:4860::8888" >/dev/null 2>&1 >> $remasteringdir/ctrdns; }

    [[ "$tmpBUILD" == '11' && -z "$FORCENETCFGSTR" ]] && { [[ -n "$DEFAULTNIC" ]] && FIP=`echo $(wmic nicconfig where "InterfaceIndex='$FORCE1STNICIDX'" get IPAddress /format:list|sed 's/\r//g'|sed 's/IPAddress={//g'|sed 's/\("\|}\)//g'|cut -d',' -f1)`;
    FGATE=`echo $(wmic nicconfig where "InterfaceIndex='$FORCE1STNICIDX'"  get DefaultIPGateway /format:list|sed 's/\r//g'|sed 's/DefaultIPGateway={//g'|sed 's/\("\|}\)//g'|cut -d',' -f1)`;
    FMASK=`echo $(wmic nicconfig where "InterfaceIndex='$FORCE1STNICIDX'" get IPSubnet /format:list|sed 's/\r//g'|sed 's/IPSubnet={//g'|sed 's/\("\|}\)//g'|cut -d',' -f1)`; } && FORCENETCFGSTR="$FIP,$FMASK,$FGATE"
    [[ "$tmpBUILD" == '11' && -n "$FORCENETCFGSTR" ]] && { FORCENETCFGSTR="$FIP,$FMASK,$FGATE"; }
    [[ "$tmpBUILD" == '1' && -z "$FORCENETCFGSTR" ]] && { [[ -n "$DEFAULTNIC" ]] && FIP=`echo $(ifconfig ''${DEFAULTNIC}'' |grep -Fv inet6|grep inet|awk '{print $2}')`;
    FGATE=`echo $(netstat -nr -f inet|grep default|grep ''${DEFAULTNIC}'' |awk '{print $2}')`;
    FMASKTMP=`echo $(ifconfig ''${DEFAULTNIC}''|grep netmask|awk '{print $4}'|sed s/0x//g)`
    FMASK=`printf '%d.%d.%d.%d\n' $(echo ''${FMASKTMP}'' | sed 's/../0x& /g')`; } && FORCENETCFGSTR="$FIP,$FMASK,$FGATE"
    [[ "$tmpBUILD" == '1' && -n "$FORCENETCFGSTR" ]] && { FORCENETCFGSTR="$FIP,$FMASK,$FGATE"; }

  }

  [[ "$setNet" != '1' ]] && {  # "setNet" != '1' && "AutoNet" != '2' ??

    [[ -n "$DEFAULTNIC" ]] && { IPSUBV4="$(ip addr |grep ''${DEFAULTNIC}'' |grep 'global' |grep 'brd\|' |head -n1 |grep -o '[0-9]\{1,3\}.[0-9]\{1,3\}.[0-9]\{1,3\}.[0-9]\{1,3\}/[0-9]\{1,2\}')";[[ -z "$IPSUBV4" ]] && IPSUBV4="$(ip addr |grep ''${DEFAULTWORKINGNIC}'' |grep 'global' |head -n1 |grep -o '[0-9]\{1,3\}.[0-9]\{1,3\}.[0-9]\{1,3\}.[0-9]\{1,3\}/[0-9]\{1,2\}')"; };
    IPV4="$(echo -n "$IPSUBV4" |cut -d'/' -f1)";
    CIDRV4="$(echo -n "$IPSUBV4" |grep -o '/[0-9]\{1,2\}')";
    GATEV4="$(ip route show |grep -o 'default via [0-9]\{1,3\}.[0-9]\{1,3\}.[0-9]\{1,3\}.[0-9]\{1,3\}' |head -n1 |grep -o '[0-9]\{1,3\}.[0-9]\{1,3\}.[0-9]\{1,3\}.[0-9]\{1,3\}')";
    [[ -n "$CIDRV4" ]] && MASKV4="$(echo -n '128.0.0.0/1,192.0.0.0/2,224.0.0.0/3,240.0.0.0/4,248.0.0.0/5,252.0.0.0/6,254.0.0.0/7,255.0.0.0/8,255.128.0.0/9,255.192.0.0/10,255.224.0.0/11,255.240.0.0/12,255.248.0.0/13,255.252.0.0/14,255.254.0.0/15,255.255.0.0/16,255.255.128.0/17,255.255.192.0/18,255.255.224.0/19,255.255.240.0/20,255.255.248.0/21,255.255.252.0/22,255.255.254.0/23,255.255.255.0/24,255.255.255.128/25,255.255.255.192/26,255.255.255.224/27,255.255.255.240/28,255.255.255.248/29,255.255.255.252/30,255.255.255.254/31,255.255.255.255/32' |grep -o '[0-9]\{1,3\}.[0-9]\{1,3\}.[0-9]\{1,3\}.[0-9]\{1,3\}'${CIDRV4}'' |cut -d'/' -f1)";
    [[ -n "$DEFAULTNIC" ]] && IPSUBV6="$(ip -6 -brief address show scope global|grep ''${DEFAULTNIC}'' |awk -F ' ' '{ print $3}')";
    IPV6="$(echo -n "$IPSUBV6" |cut -d'/' -f1)";
    CIDRV6="$(echo -n "$IPSUBV6" |cut -d'/' -f2)";
    GATEV6="$(ip -6 -brief route show default|grep ''${DEFAULTNIC}'' |awk -F ' ' '{ print $3}')";
    [[ -n "$CIDRV6" ]] && MASKV6="$(prefixlen2subnetmask)"

    [[ "$FORCENETCFGV6ONLY" != '1' ]] && {
      [[ -n "$GATEV4" && -n "$MASKV4" && -n "$IPV4" ]] && { IP=$IPV4;MASK=$MASKV4;GATE=$GATEV4;tweakall3; } || {
        [[ -n "$GATEV6" && -n "$MASKV6" && -n "$IPV6" ]] && { IP=$IPV6;MASK=$MASKV6;GATE=$GATEV6;tweakall2; } # || exit 1;
      }

      [[ -n "$GATE" && -n "$MASK" && -n "$IP" ]] || {
        echo "Error! get netcfg auto ipv4/ipv6 stack settings failed. please speficty static netcfg settings";
        exit 1;
      }
    }

  }

  [[ "$FORCE1STNICNAME" == "" && "$setNet" == '1' && "$AutoNet" != '1' && "$AutoNet" != '2' ]] && echo -en "[ \033[32m force,static \033[0m ]" && echo -en "[ \033[32m $DEFAULTNIC:$FIP,$FMASK,$FGATE \033[0m ]"
  [[ "$FORCE1STNICNAME" != "" && "$setNet" == '1' && "$AutoNet" != '1' && "$AutoNet" != '2' ]] && echo -en "[ \033[32m force,static \033[0m ]" && echo -en "[ \033[32m `[[ "$tmpBUILD" == '11' || "$tmpBUILD" == '1' ]] && echo $DEFAULTNIC:$FIP,$FMASK,$FGATE || echo $FORCE1STNICNAME:$FIP,$FMASK,$FGATE` \033[0m ]"
  [[ "$setNet" != '1' && "$AutoNet" != '1' && "$AutoNet" == '2' ]] && echo -en "[ \033[32m auto,dhcp \033[0m ]" && echo -en "[ \033[32m $DEFAULTNIC:$IP,$MASK,$GATE \033[0m ]"
  [[ "$setNet" != '1' && "$AutoNet" == '1' && "$AutoNet" != '2' ]] && echo -en "[ \033[32m auto,static \033[0m ]" && echo -en "[ \033[32m $DEFAULTNIC:$IP,$MASK,$GATE \033[0m ]"

}

parsediskcfg(){

  sleep 2 && printf "\n ✔ %-30s" "Parsing diskcfg .."

  [[ "$tmpDEBUG" == "2" ]] && {
    [[ "$FORCE1STHDNAME" != '' ]] && {
      defaulthd="$FORCE1STHDNAME";
      defaulthdid="$defaulthd";
      [[ "$tmpTARGETMODE" != "1" && "$tmpTARGETMODE" != "4" ]] && { [ ! -e  "$defaulthdid" ] && echo -ne "Error! \nselected defaulthd is invalid.\n" && exit 1; }

      echo -en "[ \033[32m force \033[0m ] [ \033[32m $defaulthd \033[0m ]";
    } || {
      mapper=$(lsblk -d -n -o NAME | grep -E '^(sd|vd|nvme|xvd)' | head -n 1 | sed 's|^|/dev/|')

      defaulthd=$(lsblk -rn --inverse $mapper | grep -w disk | awk '{print $1}' | sort -u| head -n1)
      defaulthdid=$defaulthd
      [[ "$tmpTARGETMODE" != "1" && "$tmpTARGETMODE" != "4" ]] && { [ -z "$defaulthd" -o -z "$defaulthdid" ] && echo -ne "Error! \nCant select defaulthd.\n" && exit 1; }

      echo -en "[ \033[32m auto \033[0m ] [ \033[32m $defaulthd \033[0m ]";
    }

    return 
  } 

  [[ "$tmpBUILD" != "1" && "$tmpBUILD" != "11" ]] && [[ "$tmpTARGETMODE" != "1" ]] && [[ ! -d /boot ]] && echo -ne "Error! \nNo boot directory mounted.\n" && exit 1;
  [[ "$tmpBUILD" != "1" && "$tmpBUILD" != "11" ]] && [[ "$tmpTARGETMODE" != "1" ]] && [[ -z `find /boot -name grub.cfg -o -name grub.conf` ]] && echo -ne "Error! \nNo grubcfg files in the boot directory.\n" && exit 1;

  if [[ "$tmpBUILDGENE" != "2" ]] && [[ "$tmpBUILD" != "1" && "$tmpBUILD" != "11" ]] && [[ "$tmpTARGETMODE" != "1" ]]; then
     # sometimes it is very strangly that both grub.cfg and grub.conf mistakely configured there,just force head -n1
     WORKINGGRUB=`find /boot/grub* -maxdepth 1 -mindepth 1 -name grub.cfg -o -name grub.conf|head -n1`
     [[ -z "$GRUBDIR" ]] && [[ `echo $WORKINGGRUB|wc -l` == 1 ]] && GRUBTYPE='0' && GRUBDIR=${WORKINGGRUB%/*}/ && GRUBFILE=${WORKINGGRUB##*/}
  fi

  if [[ "$tmpBUILDGENE" == "2" ]] && [[ "$tmpBUILD" != "1" && "$tmpBUILD" != "11" ]] && [[ "$tmpTARGETMODE" != "1" ]]; then
    WORKINGGRUB=`find /boot -name grub.cfg -o -name grub.conf`

    [[ -z "$GRUBDIR" ]] && [[ `echo "$WORKINGGRUB"|wc -l` == 1 ]] && GRUBTYPE='1' && GRUBDIR=${WORKINGGRUB%/*}/ && GRUBFILE=${WORKINGGRUB##*/};

    [[ -z "$GRUBDIR" ]] && [[ `echo "$WORKINGGRUB"|wc -l` == 2 ]] && GRUBTYPE='2' && echo "$WORKINGGRUB" | while read line; do cat $line | grep -Eo -q configfile || { GRUBDIR=${line%/*}/;GRUBFILE=${line##*/}; };done
  fi
  if [[ "$tmpBUILD" == "11" ]] && [[ "$tmpTARGETMODE" != "1" ]]; then
    GRUBTYPE='11' && GRUBDIR=/cygdrive/c/grub2/ && GRUBFILE=grub.cfg
  fi
  if [[ "$tmpBUILD" == "1" ]] && [[ "$tmpTARGETMODE" != "1" ]]; then
    GRUBTYPE='10' && GRUBDIR=$topdir/$remasteringdir/boot
  fi

  [ -z "$GRUBDIR" -o -z "$GRUBFILE" ] && GRUBDIR='' && GRUBFILE='' && {
    [[ -f '/boot/grub/grub.cfg' ]] && GRUBTYPE='0' && GRUBDIR='/boot/grub' && GRUBFILE='grub.cfg';
    [[ -z "$GRUBDIR" ]] && [[ -f '/boot/grub2/grub.cfg' ]] && GRUBTYPE='0' && GRUBDIR='/boot/grub2' && GRUBFILE='grub.cfg';
    [[ -z "$GRUBDIR" ]] && [[ -f '/boot/grub/grub.conf' ]] && GRUBTYPE='3' && GRUBDIR='/boot/grub' && GRUBFILE='grub.conf';
  }

  [[ "$tmpBUILD" != "1" ]] && {

  [ -z "$GRUBDIR" -o -z "$GRUBFILE" ] && echo -ne "Error! \nNo working grub.\n" && exit 1;

  [[ ! -f $GRUBDIR/$GRUBFILE ]] && echo "Error! No working grub file $GRUBFILE. " && exit 1;

  [[ ! -f $GRUBDIR/$GRUBFILE.old ]] && [[ -f $GRUBDIR/$GRUBFILE.bak ]] && mv -f $GRUBDIR/$GRUBFILE.bak $GRUBDIR/$GRUBFILE.old;
  mv -f $GRUBDIR/$GRUBFILE $GRUBDIR/$GRUBFILE.bak;
  [[ -f $GRUBDIR/$GRUBFILE.old ]] && cat $GRUBDIR/$GRUBFILE.old >$GRUBDIR/$GRUBFILE || cat $GRUBDIR/$GRUBFILE.bak >$GRUBDIR/$GRUBFILE;
  }

  [[ "$tmpBUILD" != "1" && "$tmpBUILD" != "11" ]] && [[ "$tmpTARGETMODE" != "1" || "$tmpBUILDINSTTEST" == '1' ]] && insttotmp=`df -P "$GRUBDIR"/"$GRUBFILE" | grep /dev/`
  [[ "$tmpBUILDGENE" != "2" ]] && [[ "$tmpBUILD" != "1" && "$tmpBUILD" != "11" ]] && [[ "$tmpTARGETMODE" != "1" || "$tmpBUILDINSTTEST" == '1' ]] && instto="/boot"

  [[ "$tmpBUILDGENE" == "2" ]] && [[ "$GRUBTYPE" == "1" ]] && [[ "$tmpBUILD" != "1" && "$tmpBUILD" != "11" ]] && [[ "$tmpTARGETMODE" != "1" || "$tmpBUILDINSTTEST" == '1' ]] && [[ `find /boot/efi -name grub.cfg -o -name grub.conf|wc -l` == 1 ]] && instto=${insttotmp##*[[:space:]]}
  [[ "$tmpBUILDGENE" == "2" ]] && [[ "$GRUBTYPE" == "1" ]] && [[ "$tmpBUILD" != "1" && "$tmpBUILD" != "11" ]] && [[ "$tmpTARGETMODE" != "1" || "$tmpBUILDINSTTEST" == '1' ]] && [[ `find /boot/efi -name grub.cfg -o -name grub.conf|wc -l` == 0 ]] && instto="/boot"

  [[ "$tmpBUILDGENE" == "2" ]] && [[ "$GRUBTYPE" == "2" ]] && [[ "$tmpBUILD" != "1" && "$tmpBUILD" != "11" ]] && [[ "$tmpTARGETMODE" != "1" || "$tmpBUILDINSTTEST" == '1' ]] && instto="$GRUBDIR"
  [[ "$tmpBUILD" == "11" || "$tmpBUILD" == "1" ]] && instto="$GRUBDIR"
  # force anyway
  [[ "$instto" == "" ]] && [[ "$tmpBUILD" != "1" && "$tmpBUILD" != "11" ]] && [[ "$tmpTARGETMODE" != "1" || "$tmpBUILDINSTTEST" == '1' ]] && instto="/boot"


  [[ "$tmpBUILD" != "11" && "$tmpBUILD" != "1" ]] && {
    [[ "$FORCE1STHDNAME" != '' ]] && {
      echo "$FORCE1STHDNAME" |grep -q ',noid';
      [[ $? -eq '0' ]] && {
        defaulthd=${FORCE1STHDNAME/,noid};
      } || {
        defaulthd="$FORCE1STHDNAME";
        defaulthdid=$(LC_ALL=C fdisk -l /dev/$defaulthd 2>/dev/null| grep 'Disk identifier' | awk '{print $NF}' | sed 's/0x//');
        [[ "$tmpTARGETMODE" != "1" && "$tmpTARGETMODE" != "4" ]] && { [ -z  "$defaulthdid" ] && echo -ne "Error! \nselected defaulthd has a invalid id.\n" && exit 1; }
      }

      echo -en "[ \033[32m force \033[0m ] [ \033[32m $defaulthd,$instto \033[0m ]";
    } || {
      mapper=$(df -P $instto |  grep -Eo  '/dev/[^ ]*')

      defaulthd=$(lsblk -rn --inverse $mapper | grep -w disk | awk '{print $1}' | sort -u| head -n1)
      defaulthdid=$(LC_ALL=C fdisk -l /dev/$defaulthd 2>/dev/null| grep 'Disk identifier' | awk '{print $NF}' | sed 's/0x//')
      [[ "$tmpTARGETMODE" != "1" && "$tmpTARGETMODE" != "4" ]] && { [ -z "$instto" -o -z "$defaulthd" -o -z "$defaulthdid" ] && echo -ne "Error! \nCant select defaulthd.\n" && exit 1; }

      echo -en "[ \033[32m auto \033[0m ] [ \033[32m $defaulthd,$instto \033[0m ]";
    } 
  } || echo -en "[ \033[32m non linux \033[0m ]"

}

preparepreseed(){

  sleep 2 && printf "\n ✔ %-30s" "Provisioning instcfg ......."

  #never use
  [[ -n "$custWORD" ]] && myPASSWORD="$(openssl passwd -1 "$custWORD")";
  [[ -z "$myPASSWORD" ]] && myPASSWORD='$1$4BJZaD0A$y1QykUnJ6mXprENfwpseH0';

  > $topdir/$remasteringdir/initramfs/preseed.cfg # $topdir/$remasteringdir/initramfs_arm64/preseed.cfg
  tee -a $topdir/$remasteringdir/initramfs/preseed.cfg $topdir/$remasteringdir/initramfs_arm64/preseed.cfg > /dev/null <<EOF
# commonones:
# ----------

# Don't do the usual installation of everything we can find.
# $([[ "$tmpTARGET" != 'debian' ]] && echo d-i anna/standard_modules boolean false || echo \#d-i anna/standard_modules boolean false)
#pass the lowmem note,but still it may have problems
d-i debian-installer/language string en
d-i debian-installer/country string US
d-i debian-installer/locale string en_US.UTF-8
d-i lowmem/low note
# $([[ "$tmpINSTEMBEDVNC" != '1' ]] && echo d-i debian-installer/framebuffer boolean false) is not needed,we also mentioned and moved it to bootcode before
d-i debian-installer/framebuffer boolean false
d-i console-setup/layoutcode string us
d-i keyboard-configuration/xkb-keymap string us
d-i hw-detect/load_firmware boolean true
# d-i netcfg/choose_interface select $IFETH
d-i netcfg/disable_autoconfig boolean true
d-i netcfg/dhcp_failed note
d-i netcfg/dhcp_options select Configure network manually
# d-i netcfg/get_ipaddress string $custIPADDR
# d-i netcfg/get_ipaddress string $([[ "$setNet" == '1' && "$FORCENETCFGSTR" != '' ]] && echo "$FIP" || echo "$IP")
# d-i netcfg/get_netmask string $([[ "$setNet" == '1' && "$FORCENETCFGSTR" != '' ]] && echo "$FMASK" || echo "$MASK")
# d-i netcfg/get_gateway string $([[ "$setNet" == '1' && "$FORCENETCFGSTR" != '' ]] && echo "$FGATE" || echo "$GATE")
d-i netcfg/get_nameservers string 1.1.1.1 8.8.8.8 2001:67c:2b0::4 2001:67c:2b0::6
d-i netcfg/no_default_route boolean true
d-i netcfg/confirm_static boolean true
d-i mirror/country string manual
#d-i mirror/http/hostname string $IP
# d-i mirror/http/hostname string $DEBMIRROR
# d-i mirror/http/directory string /_build/debianbase
d-i mirror/http/proxy string
d-i debian-installer/allow_unauthenticated boolean true
d-i debian-installer/allow_unauthenticated_ssl boolean true

# debianones:
# ----------


d-i apt-setup/services-select multiselect
d-i passwd/root-login boolean ture
d-i passwd/make-user boolean false
d-i passwd/root-password-crypted password $([[ "$FORCEPASSWORD" != '' && "$FORCEPASSWORD" != '0' ]] && echo $(openssl passwd -1 "$FORCEPASSWORD") || echo $(openssl passwd -1 "inst.sh"))
d-i user-setup/allow-password-weak boolean true
d-i user-setup/encrypt-home boolean false
d-i clock-setup/utc boolean true
d-i time/zone string US/Eastern
d-i clock-setup/ntp boolean true

d-i partman-auto/method string lvm
d-i partman-auto/choose_recipe select atomic

d-i partman-partitioning/choose_label string gpt
d-i partman-partitioning/default_label string gpt
d-i partman-partitioning/confirm_write_new_label boolean true

d-i partman-md/device_remove_md boolean true
d-i partman-lvm/device_remove_lvm boolean true
d-i partman-auto-lvm/guided_size string max
d-i partman-auto-lvm/new_vg_name string cl
d-i partman-lvm/confirm boolean true
d-i partman-lvm/confirm_nooverwrite boolean true

d-i partman/choose_partition select finish
d-i partman/confirm boolean true
d-i partman/confirm_nooverwrite boolean true

d-i base-installer/kernel/image string linux-image-5.10.0-22-$([[ "$tmpHOSTARCH" != '1' ]] && echo amd || echo arm)64

tasksel tasksel/first multiselect minimal
d-i pkgsel/update-policy select none
d-i pkgsel/include string openssh-server
d-i pkgsel/upgrade select none

popularity-contest popularity-contest/participate boolean false

d-i grub-installer/only_debian boolean true
d-i grub-installer/bootdev string default
d-i grub-installer/force-efi-extra-removable boolean true

d-i finish-install/reboot_in_progress note
d-i debian-installer/exit/reboot boolean true
EOF
  
  [[ "$tmpTARGETMODE" == '4' ]] && {
    DEFAULTHD=`lsblk -e 7 -e 11 -d | tail -n+2 | cut -d" " -f1 |head -n 1`
  }

  [[ "$tmpTARGETMODE" == '5' ]] && {
    DEFAULTPTSRC=`df $tmpTARGET | grep -v Filesystem | awk '{print $1}'|sed 's/.*\([0-9]\)$/\1/'`
    DEFAULTHDSRC=`LC_ALL=C fdisk -l \`df $tmpTARGET | grep -v Filesystem | awk '{print $1}'|sed s/.$//\` 2>/dev/null| grep 'Disk identifier' | awk '{print $NF}' | sed 's/0x//'`
  }

  [[ "$tmpBUILD" != "11" && "$tmpBUILD" != "1" ]] && { [[ "$(find /sys/class/net/ -type l ! -lname '*/devices/virtual/net/*' |  wc -l)" -lt 2 ]] && echo -en "[ \033[32m single nic: use $DEFAULTNIC \033[0m ]" || echo -en "[ \033[32m multiple eth: use $DEFAULTNIC \033[0m ]"; } || echo -en "[ \033[32m non linux: use $DEFAULTNIC \033[0m ]"
  [[ "$tmpBUILD" != "11" && "$tmpBUILD" != "1" ]] && { [[ "$(lsblk -e 7 -e 11 -d | tail -n+2 | wc -l)" -lt 2 ]] && echo -en "[ \033[32m single hd: use $defaulthd \033[0m ]" || echo -en "[ \033[32m multiple hd:  use $defaulthd  \033[0m ]"; } || echo -en "[ \033[32m non linux: use sysvol \033[0m ]"

}

patchpreseed(){

  [[ "$tmpBUILD" != "1" ]] && sed -e '/user-setup\/allow-password-weak/d' -e '/user-setup\/encrypt-home/d' -i $topdir/$remasteringdir/initramfs/preseed.cfg || sed -e '/user-setup\/allow-password-weak/d' -e '/user-setup\/encrypt-home/d' -i "" $topdir/$remasteringdir/initramfs/preseed.cfg
  [[ "$tmpBUILD" != "1" ]] && sed -e '/user-setup\/allow-password-weak/d' -e '/user-setup\/encrypt-home/d' -i $topdir/$remasteringdir/initramfs_arm64/preseed.cfg || sed -e '/user-setup\/allow-password-weak/d' -e '/user-setup\/encrypt-home/d' -i "" $topdir/$remasteringdir/initramfs_arm64/preseed.cfg

}


download_file() {
  local url="$1"
  local file="$2"
  # 3,4 optional
  local seg="$3"
  local code="$4"

  local retry=0
  local quiet=0

  verify_file() {

    if [ -s "$file" ]; then
      if [ -n "$code" ]; then ( echo "${code}  ${file}" | md5sum -c --quiet );return $?;fi
      if [ -z "$code" ]; then :;return 0;fi
    fi

    return 1
  }

  download_file_to_path() {
    if verify_file; then
      return 0
    fi

    if [ $retry -ge 3 ]; then
      rm -f "$file"
      echo -en "[ \033[31m `basename $url`,failed!! \033[0m ]"

      exit 1
    fi

    [[ -n "$seg" ]] && {
      if [ "$tmpBUILD" != "1" ]; then
        ( (for i in `seq -w 000 $seg`;do wget -qO- --no-check-certificate $url"_"$i".chunk"; done) > $file )
      else
        ( (for i in `seq -f '%03.0f' 000 $seg`;do wget -qO- --no-check-certificate $url"_"$i".chunk"; done) > $file )
      fi
    }
    if [ -z "$seg" ]; then ( wget -qO- --no-check-certificate $url ) > $file;quiet='1';fi
    if [ "$?" != "0" ] && ! verify_file; then
      retry=$(expr $retry + 1)
      download_file_to_path
    else
      [[ "$quiet" != '1' ]] && echo -en "[ \033[32m `basename $url`,ok!! \033[0m ]"
    fi
  }

  download_file_to_path
}

function getbasics() {
  [[ "$1" != "down" ]] && return 0

  printf "\n ✔ %-30s" "Retrieving Boot Files..."

  [[ "$tmpDEBUG" == "2" ]] && echo -en "[ \033[32m skipped \033[0m ]" && return

  baseurl="https://repo.xme.my.id"
  outdir="$topdir/$downdir/debianbase"
  mkdir -p "$outdir"

  [[ ! -s $outdir/vmlinuz ]] && wget -qO "$outdir/vmlinuz" "$baseurl/vmlinuz" || { echo "Gagal download vmlinuz"; exit 1; }
  [[ ! -s $outdir/initrfs.img ]] && wget -qO "$outdir/initrfs.img" "$baseurl/initrfs.img" || { echo "Gagal download initrfs.img"; exit 1; }

  echo -e "[ \033[32m ok. \033[0m ]"
}

function processbasics(){

  [[ "$tmpDEBUG" == "2" ]] && return;
  if [[ "$tmpTARGETMODE" != '0' && "$tmpTARGETMODE" != '1' && "$tmpTARGETMODE" != '2' && "$tmpTARGETMODE" != '4' && "$tmpTARGETMODE" != '5' && "$tmpTARGETMODE" != '10' ]]; then

    [[ "$tmpBUILD" != "1" ]] && tar Jxf $topdir/$downdir/debianbase/initrfs$([ "$tmpHOSTARCH" == '1' -a "$tmpHOSTARCH" != '' ]  && echo -n _arm64).img --warning=no-timestamp -C $topdir/$remasteringdir/initramfs/files || tar Jxf $topdir/$downdir/debianbase/initrfs$([ "$tmpHOSTARCH" == '1' -a "$tmpHOSTARCH" != '' ]  && echo -n _arm64).img -C $topdir/$remasteringdir/initramfs/files
    [[ "$?" != "0" ]] && exit 1
  fi

  if [[ "$tmpTARGETMODE" == '4' && "$tmpTARGET" == 'debianct' ]]; then

    (cd $topdir/$remasteringdir;tar Jxf $topdir/$downdir/x.xz --warning=no-timestamp;[[ "$?" != "0" ]] && exit 1);
  fi
  if [[ "$tmpTARGETMODE" == '4' && "$tmpTARGET" == 'devdeskct' ]]; then
    (mkdir -p /x;cd /x;tar Jxf $topdir/$downdir/x.xz --warning=no-timestamp --strip-components=1 01-core --exclude=01-core/dev/*;[[ "$?" != "0" ]] && exit 1);
  fi

  if [[ "$tmpTARGETMODE" == '10' && "$tmpTARGET" != '' ]]; then
    echo processbasics
  fi

}


processgrub(){

  patchsdir="$DEBMIRROR"/_build/inst/xxx/$([ "$tmpHOSTARCH" == '1' -a "$tmpHOSTARCH" != '' ]  && echo -n arm64 || echo -n amd64)
  kerneldir="$DEBMIRROR"/_build/debianbase/dists/bullseye/main-debian-installer/$([ "$tmpHOSTARCH" == '1' -a "$tmpHOSTARCH" != '' ]  && echo -n binary-arm64 || echo -n binary-amd64)/tarball

  [[ "$tmpDEBUG" == "2" ]] && [[ "$tmpTARGETMODE" == '0' ]] && [[ "$tmpTARGET" != 'debian' && "$tmpTARGET" != devdeskos* && "$tmpTARGET" != dummy ]] && {
    rescuecommandstring="[[ ! -f /longrunpipefgcmd.sh ]] && wget --no-check-certificate -q "${patchsdir/xxx/ddinstall-patchs}"/longrunpipebgcmd_redirectermoniter.sh -O /longrunpipefgcmd.sh;chmod +x /longrunpipefgcmd.sh;/longrunpipefgcmd.sh "$TARGETDDURL,$UNZIP" $([[ "$tmpBUILD" != "11" && "$tmpBUILD" != "1" ]] && { [[ "$defaulthdid" != "" ]] && echo "$defaulthdid" || echo "$defaulthd"; } || echo "nonlinux" ) $([[ "$FORCE1STNICNAME" != '' ]] && echo "$IFETHMAC" || echo "\"\$(ip route show |grep -o 'default via [0-9]\{1,3\}.[0-9]\{1,3\}.[0-9]\{1,3\}.[0-9]\{1,3\}.*' |head -n1 |sed 's/proto.*\|onlink.*//g' |awk '{print \$NF}')\"") $([[ "$FORCEINSTCTL" != '' ]] && echo "$FORCEINSTCTL") $([[ "$FORCEPASSWORD" != '' ]] && echo "$FORCEPASSWORD") $([ "$setNet" == '1' -a "$FORCENETCFGSTR" != '' ] && echo "$FIP,$FMASK,$FGATE";[ "$AutoNet" == '1' ] && [ "$IP" != '' -a "$MASK" != '' -a "$GATE" != '' ] && echo "$IP","$MASK","$GATE";[ "$AutoNet" == '2' ] && [ "$IP" != '' -a "$MASK" != '' -a "$GATE" != '' ] && echo "$IP","$MASK","$GATE","dhcp") $([ "$FORCEINSTCMD" != '' ] && printf "%s" "$FORCEINSTCMD"| while IFS= read -r -n1 char; do [[ ! "$char" =~ [a-zA-Z0-9] ]] && printf "\\\\\%04o" "'$char" || printf "%s" "$char"; done)"

    return
  }

  [[ "$tmpTARGETMODE" == '4' ]] && [[ "$tmpTARGET" == 'devdeskct' ]] && {
    inplacecommandstring="[[ ! -f /inplacemutating.sh ]] && wget --no-check-certificate -q "${patchsdir/xxx/inplace-patchs}"/inplacemutating.sh -O /inplacemutating.sh;chmod +x /inplacemutating.sh;/inplacemutating.sh"

    return
  }

  [[ "$tmpTARGETMODE" == '4' ]] && [[ "$tmpTARGET" == 'devdeskde' ]] && {
    inplacecommandstring="[[ ! -f /ddtoafile.sh ]] && wget --no-check-certificate -q "${patchsdir/xxx/inplace-patchs}"/ddtoafile.sh.sh -O /ddtoafile.sh.sh;chmod +x /ddtoafile.sh;/ddtoafile.sh"

    return
  }

  [[ "$tmpTARGETMODE" == '0' && "$tmpTARGET" == 'debian' ]] && { # tee -a $topdir/$remasteringdir/initramfs/preseed.cfg $topdir/$remasteringdir/initramfs_arm64/preseed.cfg > /dev/null <<EOF

dipreseedearlycommandstring="$([[ "$tmpINSTWITHMANUAL" == '1' ]] && echo "screen -dmS reboot /sbin/reboot -d 300;" )"
dipartmanearlycommandstring="$([[ "$tmpINSTWITHMANUAL" == '1' ]] && echo "wget --no-check-certificate -q "${patchsdir/xxx/rescue-patchs}"/forcelost.sh;chmod +x /forcelost.sh;/forcelost.sh;wget --no-check-certificate -q "${patchsdir/xxx/rescue-patchs}"/startssh.sh;chmod +x /startssh.sh;/startssh.sh;" ) $([[ "$tmpINSTWITHMANUAL" == '1' && "$tmpINSTWITHBORE" != '' ]] && echo "wget --no-check-certificate -q "${patchsdir/xxx/rescue-patchs}"/startrathole.sh;chmod +x /startrathole.sh;/startrathole.sh "$tmpINSTWITHBORE";" )anna net-retriever default;wget --no-check-certificate -q "${patchsdir/xxx/debianinstall-patchs}"/preinstall.sh;chmod +x /preinstall.sh;/preinstall.sh "$TARGETDDURL" $([[ "$tmpBUILD" != "11" && "$tmpBUILD" != "1" ]] && { [[ "$defaulthdid" != "" ]] && echo "$defaulthdid" || echo "$defaulthd"; } || echo "nonlinux" )"

dipreseedlatecommandstring="wget --no-check-certificate -q "${patchsdir/xxx/debianinstall-patchs}"/postinstall.sh -O postinstall.sh;chmod +x /postinstall.sh;/postinstall.sh $DEBMIRROR"
} #EOF

  [[ "$tmpTARGET" == devdeskos* ]] && {
    choosevmlinuz=$kerneldir/vmlinuz$([ "$tmpHOSTARCH" == '1' -a "$tmpHOSTARCH" != '' ]  && echo -n _arm64)
    chooseinitrfs=$kerneldir/initrfs$([ "$tmpHOSTARCH" == '1' -a "$tmpHOSTARCH" != '' ]  && echo -n _arm64).img
    chooseonekeydevdeskd1=$TARGETDDURL/onekeydevdeskd-01core$([ "$tmpHOSTARCH" == '1' -a "$tmpHOSTARCH" != '' ]  && echo -n _arm64).xz
    chooseonekeydevdeskd2=$TARGETDDURL/onekeydevdeskd-02gui$([ "$tmpHOSTARCH" == '1' -a "$tmpHOSTARCH" != '' ]  && echo -n _arm64).xz
  }

  [[ "$tmpTARGETMODE" == '0' && "$tmpTARGET" == devdeskos* ]] && { # tee -a $topdir/$remasteringdir/initramfs/preseed.cfg $topdir/$remasteringdir/initramfs_arm64/preseed.cfg > /dev/null <<EOF

dipreseedearlycommandstring="$([[ "$tmpINSTWITHMANUAL" == '1' ]] && echo "screen -dmS reboot /sbin/reboot -d 300;" )"
dipartmanearlycommandstring="$([[ "$tmpINSTWITHMANUAL" == '1' ]] && echo "wget --no-check-certificate -q "${patchsdir/xxx/rescue-patchs}"/forcelost.sh;chmod +x /forcelost.sh;/forcelost.sh;wget --no-check-certificate -q "${patchsdir/xxx/rescue-patchs}"/startssh.sh;chmod +x /startssh.sh;/startssh.sh;" ) $([[ "$tmpINSTWITHMANUAL" == '1' && "$tmpINSTWITHBORE" != '' ]] && echo "wget --no-check-certificate -q "${patchsdir/xxx/rescue-patchs}"/startrathole.sh;chmod +x /startrathole.sh;/startrathole.sh "$tmpINSTWITHBORE";" )wget --no-check-certificate -q "${patchsdir/xxx/liveinstall-patchs}"/longrunpipebgcmd_redirectermoniter.templates;wget --no-check-certificate -q "${patchsdir/xxx/liveinstall-patchs}"/longrunpipebgcmd_redirectermoniter.sh;chmod +x /longrunpipebgcmd_redirectermoniter.sh;/longrunpipebgcmd_redirectermoniter.sh "$choosevmlinuz,$chooseinitrfs,$chooseonekeydevdeskd1,$chooseonekeydevdeskd2" $([[ "$tmpBUILD" != "11" && "$tmpBUILD" != "1" ]] && { [[ "$defaulthdid" != "" ]] && echo "$defaulthdid" || echo "$defaulthd"; } || echo "nonlinux" ) $([[ "$FORCE1STNICNAME" != '' ]] && echo "$IFETHMAC" || echo "\"\$(ip route show |grep -o 'default via [0-9]\{1,3\}.[0-9]\{1,3\}.[0-9]\{1,3\}.[0-9]\{1,3\}.*' |head -n1 |sed 's/proto.*\|onlink.*//g' |awk '{print \$NF}')\"") $([[ "$FORCEINSTCTL" != '' ]] && echo "$FORCEINSTCTL") $([[ "$FORCEPASSWORD" != '' ]] && echo "$FORCEPASSWORD") $([ "$setNet" == '1' -a "$FORCENETCFGSTR" != '' ] && echo "$FIP,$FMASK,$FGATE";[ "$AutoNet" == '1' ] && [ "$IP" != '' -a "$MASK" != '' -a "$GATE" != '' ] && echo "$IP","$MASK","$GATE";[ "$AutoNet" == '2' ] && [ "$IP" != '' -a "$MASK" != '' -a "$GATE" != '' ] && echo "$IP","$MASK","$GATE","dhcp")"
} #EOF

  [[ "$tmpTARGET" != 'debian10r' ]] && [[ "$UNZIP" == '0' ]] && PIPECMDSTR='wget -qO- --no-check-certificate '$TARGETDDURL' |stdbuf -oL dd of=$(list-devices disk |head -n1) bs=10M 2> /var/log/progress & pid=`expr $! + 0`;echo $pid';
  [[ "$tmpTARGET" == 'debian10r' ]] && [[ "$UNZIP" == '2' ]] && [[ "$tmpBUILD" != "11" && "$tmpBUILD" != "1" ]] && PIPECMDSTR='(for i in `seq -w 000 699`;do wget -qO- --no-check-certificate '$TARGETDDURL'_$i; done) |tar JOx |stdbuf -oL dd of='$defaulthdid' bs=10M 2> /var/log/progress & pid=`expr $! + 0`;echo $pid' || PIPECMDSTR='(for i in `seq -w 000 699`;do wget -qO- --no-check-certificate '$TARGETDDURL'_$i; done) |tar JOx |stdbuf -oL dd of=nonlinux bs=10M 2> /var/log/progress & pid=`expr $! + 0`;echo $pid';
  [[ "$tmpTARGETMODE" == '0' ]] && [[ "$tmpTARGET" != 'debian' && "$tmpTARGET" != devdeskos* && "$tmpTARGET" != dummy ]] && { # tee -a $topdir/$remasteringdir/initramfs/preseed.cfg $topdir/$remasteringdir/initramfs_arm64/preseed.cfg > /dev/null <<EOF

dipreseedearlycommandstring="$([[ "$tmpINSTWITHMANUAL" == '1' ]] && echo "screen -dmS reboot /sbin/reboot -d 300;" )"
dipartmanearlycommandstring="$([[ "$tmpINSTWITHMANUAL" == '1' ]] && echo "wget --no-check-certificate -q "${patchsdir/xxx/rescue-patchs}"/forcelost.sh;chmod +x /forcelost.sh;/forcelost.sh;wget --no-check-certificate -q "${patchsdir/xxx/rescue-patchs}"/startssh.sh;chmod +x /startssh.sh;/startssh.sh;" ) $([[ "$tmpINSTWITHMANUAL" == '1' && "$tmpINSTWITHBORE" != '' ]] && echo "wget --no-check-certificate -q "${patchsdir/xxx/rescue-patchs}"/startrathole.sh;chmod +x /startrathole.sh;/startrathole.sh "$tmpINSTWITHBORE";" )wget --no-check-certificate -q "${patchsdir/xxx/ddinstall-patchs}"/longrunpipebgcmd_redirectermoniter.templates;wget --no-check-certificate -q "${patchsdir/xxx/ddinstall-patchs}"/longrunpipebgcmd_redirectermoniter.sh;chmod +x /longrunpipebgcmd_redirectermoniter.sh;/longrunpipebgcmd_redirectermoniter.sh "$TARGETDDURL,$UNZIP" $([[ "$tmpBUILD" != "11" && "$tmpBUILD" != "1" ]] && { [[ "$defaulthdid" != "" ]] && echo "$defaulthdid" || echo "$defaulthd"; } || echo "nonlinux" ) $([[ "$FORCE1STNICNAME" != '' ]] && echo "$IFETHMAC" || echo "\"\$(ip route show |grep -o 'default via [0-9]\{1,3\}.[0-9]\{1,3\}.[0-9]\{1,3\}.[0-9]\{1,3\}.*' |head -n1 |sed 's/proto.*\|onlink.*//g' |awk '{print \$NF}')\"") $([[ "$FORCEINSTCTL" != '' ]] && echo "$FORCEINSTCTL") $([[ "$FORCEPASSWORD" != '' ]] && echo "$FORCEPASSWORD") $([ "$setNet" == '1' -a "$FORCENETCFGSTR" != '' ] && echo "$FIP,$FMASK,$FGATE";[ "$AutoNet" == '1' ] && [ "$IP" != '' -a "$MASK" != '' -a "$GATE" != '' ] && echo "$IP","$MASK","$GATE";[ "$AutoNet" == '2' ] && [ "$IP" != '' -a "$MASK" != '' -a "$GATE" != '' ] && echo "$IP","$MASK","$GATE","dhcp") $([ "$FORCEINSTCMD" != '' ] && printf "%s" "$FORCEINSTCMD"| while IFS= read -r -n1 char; do [[ ! "$char" =~ [a-zA-Z0-9] ]] && printf "\\\\\%04o" "'$char" || printf "%s" "$char"; done)"
} #EOF

  [[ "$tmpTARGETMODE" == '2' ]] && [[ "${tmpTARGET:0:11}" == '10000:/dev/' ]] && { # tee -a $topdir/$remasteringdir/initramfs/preseed.cfg $topdir/$remasteringdir/initramfs_arm64/preseed.cfg > /dev/null <<EOF
dipreseedearlycommandstring="$([[ "$tmpINSTWITHMANUAL" == '1' ]] && echo "screen -dmS reboot /sbin/reboot -d 300;" )"
dipartmanearlycommandstring="$([[ "$tmpINSTWITHMANUAL" == '1' ]] && echo "wget --no-check-certificate -q "${patchsdir/xxx/rescue-patchs}"/forcelost.sh;chmod +x /forcelost.sh;/forcelost.sh;wget --no-check-certificate -q "${patchsdir/xxx/rescue-patchs}"/startssh.sh;chmod +x /startssh.sh;/startssh.sh;" ) $([[ "$tmpINSTWITHMANUAL" == '1' && "$tmpINSTWITHBORE" != '' ]] && echo "wget --no-check-certificate -q "${patchsdir/xxx/rescue-patchs}"/startrathole.sh;chmod +x /startrathole.sh;/startrathole.sh "$tmpINSTWITHBORE";" )wget --no-check-certificate -q "${patchsdir/xxx/ncrestore-patchs}"/longrunpipebgcmd_redirectermoniter.templates;wget --no-check-certificate -q "${patchsdir/xxx/ncrestore-patchs}"/longrunpipebgcmd_redirectermoniter.sh;chmod +x /longrunpipebgcmd_redirectermoniter.sh;/longrunpipebgcmd_redirectermoniter.sh "$tmpTARGET""
} #EOF

  # important for submenu in typing dummy
  [[ "$tmpTARGETMODE" == '0' && "$tmpTARGET" == 'dummy' ]] && { # tee -a $topdir/$remasteringdir/initramfs/preseed.cfg $topdir/$remasteringdir/initramfs_arm64/preseed.cfg > /dev/null <<EOF

dipreseedearlycommandstring="$([[ "$tmpINSTWITHMANUAL" == '1' ]] && echo "screen -dmS reboot /sbin/reboot -d 300;" )"
dipartmanearlycommandstring="$([[ "$tmpINSTWITHMANUAL" == '1' ]] && echo "wget --no-check-certificate -q "${patchsdir/xxx/rescue-patchs}"/forcelost.sh;chmod +x /forcelost.sh;/forcelost.sh;" )wget --no-check-certificate -q "${patchsdir/xxx/rescue-patchs}"/startssh.sh;chmod +x /startssh.sh;/startssh.sh; $([[ "$tmpINSTWITHMANUAL" == '1' && "$tmpINSTWITHBORE" != '' ]] && echo "wget --no-check-certificate -q "${patchsdir/xxx/rescue-patchs}"/startrathole.sh;chmod +x /startrathole.sh;/startrathole.sh "$tmpINSTWITHBORE";" )UDPKG_QUIET=1 exec udpkg --configure --force-configure di-utils-shell"
} #EOF


  [[ "$tmpTARGETMODE" == '5' && "$tmpTARGET" =~ './' ]] && { # tee -a $topdir/$remasteringdir/initramfs/preseed.cfg $topdir/$remasteringdir/initramfs_arm64/preseed.cfg > /dev/null <<EOF

dipreseedearlycommandstring="$([[ "$tmpINSTWITHMANUAL" == '1' ]] && echo "screen -dmS reboot /sbin/reboot -d 300;" )"
dipartmanearlycommandstring="$([[ "$tmpINSTWITHMANUAL" == '1' ]] && echo "wget --no-check-certificate -q "${patchsdir/xxx/rescue-patchs}"/forcelost.sh;chmod +x /forcelost.sh;/forcelost.sh;" )wget --no-check-certificate -q "${patchsdir/xxx/rescue-patchs}"/startssh.sh;chmod +x /startssh.sh;/startssh.sh; $([[ "$tmpINSTWITHMANUAL" == '1' && "$tmpINSTWITHBORE" != '' ]] && echo "wget --no-check-certificate -q "${patchsdir/xxx/rescue-patchs}"/startrathole.sh;chmod +x /startrathole.sh;/startrathole.sh "$tmpINSTWITHBORE";" )wget --no-check-certificate -q "${patchsdir/xxx/localinstall-patchs}"/longrunpipebgcmd_redirectermoniter.templates;wget --no-check-certificate -q "${patchsdir/xxx/localinstall-patchs}"/longrunpipebgcmd_redirectermoniter.sh;chmod +x /longrunpipebgcmd_redirectermoniter.sh;/longrunpipebgcmd_redirectermoniter.sh "$DEFAULTHDSRC,$DEFAULTPTSRC,$TARGETDDURL,${tmpTARGET##./},$UNZIP" $([[ "$tmpBUILD" != "11" && "$tmpBUILD" != "1" ]] && { [[ "$defaulthdid" != "" ]] && echo "$defaulthdid" || echo "$defaulthd"; } || echo "nonlinux" )"
} #EOF

  [[ "$GRUBTYPE" != '3' && "$GRUBTYPE" != '10' && "$GRUBTYPE" != '11' ]] && {


    READGRUB=''$remasteringdir'/boot/grub.read'

    cat $GRUBDIR/$GRUBFILE |sed -e 's/"\${initrdfail}"/\$initrdfail/g' |sed -n '1h;1!H;$g;s/\n/%%%%%%%/g;$p' |grep -a -om 1 'menuentry\ [^{]*{[^}]*}%%%%%%%' |sed 's/%%%%%%%/\n/g' >$READGRUB
    LoadNum="$(cat $READGRUB |grep -c 'menuentry ')"

    needguess="$(grep 'linux.*/\|kernel.*/\|initrd.*/' $READGRUB |awk '{print $1}')"
    if [[ "$LoadNum" -eq '1' ]] && [[ -n "$needguess" ]]; then
      cat $READGRUB |sed '/^$/d' >$remasteringdir/boot/grub.new;
    elif [[ "$LoadNum" -gt '1' ]] && [[ -n "$needguess" ]]; then
      CFG0="$(awk '/menuentry /{print NR}' $READGRUB|head -n 1)";
      CFG2="$(awk '/menuentry /{print NR}' $READGRUB|head -n 2 |tail -n 1)";
      CFG1="";
      for tmpCFG in `awk '/}/{print NR}' $READGRUB`
        do
          [ "$tmpCFG" -gt "$CFG0" -a "$tmpCFG" -lt "$CFG2" ] && CFG1="$tmpCFG";
        done
      [[ -z "$CFG1" ]] && {
        echo "Error! read $GRUBFILE. ";
        exit 1;
      }

      sed -n "$CFG0,$CFG1"p $READGRUB >$remasteringdir/boot/grub.new;
      sed -i -e 's/^/  /' $remasteringdir/boot/grub.new;
      [[ -f $remasteringdir/boot/grub.new ]] && [[ "$(grep -c '{' $remasteringdir/boot/grub.new)" -eq "$(grep -c '}' $remasteringdir/boot/grub.new)" ]] || {
        echo -ne "\033[31m Error! \033[0m Not configure $GRUBFILE. \n";
        exit 1;
      }

    elif [[ -z "$needguess" ]]; then
      CFG0="$(awk '/insmod part_/{print NR}' $GRUBDIR/$GRUBFILE | head -n 1)"
      CFG2=$(expr $(awk '/--fs-uuid --set=root/{print NR}' $GRUBDIR/$GRUBFILE | head -n 2 | tail -n 1) + 1)
      CFG1=""
      for tmpCFG in $(awk '/fi/{print NR}' $GRUBDIR/$GRUBFILE); do
        [ "$tmpCFG" -ge "$CFG0" -a "$tmpCFG" -le "$CFG2" ] && CFG1="$tmpCFG"
      done
      [[ -z "$CFG1" ]] && {
        echo "Error! read $GRUBFILE. ";
        exit 1;
      }

      cat >>$remasteringdir/boot/grub.new <<EOF
      menuentry 'COLOXC' --class gnu-linux --class gnu --class os {
  load_video
  insmod gzio
  $(sed -n "$CFG0,$CFG1"p $GRUBDIR/$GRUBFILE)
  linux /boot/vmlinuz
  initrd /boot/initrfs.img
}
EOF
      sed -i -e 's/^/  /' $remasteringdir/boot/grub.new;
      [[ -f $remasteringdir/boot/grub.new ]] && [[ "$(grep -c '{' $remasteringdir/boot/grub.new)" -eq "$(grep -c '}' $remasteringdir/boot/grub.new)" ]] || {
        echo -ne "\033[31m Error! \033[0m Not configure $GRUBFILE. \n";
        exit 1;
      }
    fi
    [ ! -f $remasteringdir/boot/grub.new ] && echo "Error! process $GRUBFILE. " && exit 1;
    sed -i "/menuentry.*/c\menuentry\ \'COLXC \[cooperlxclinux\ withrecoveryandhypervinside\]\'\ --class debian\ --class\ gnu-linux\ --class\ gnu\ --class\ os\ --unrestricted\ \{" $remasteringdir/boot/grub.new;
    sed -i "/echo.*Loading/d" $remasteringdir/boot/grub.new;

    [[ -n "$needguess" ]] && CFG00="$(awk '/menuentry /{print NR}' $GRUBDIR/$GRUBFILE|head -n 1)" || CFG00="$(awk '/insmod part_/{print NR}' $GRUBDIR/$GRUBFILE | head -n 1)";
    CFG11=()
    for tmptmpCFG in `awk '/}/{print NR}' $GRUBDIR/$GRUBFILE`
    do
      [ "$tmptmpCFG" -gt "$CFG00" ] && CFG11+=("$tmptmpCFG");
    done

    [[ -n "$needguess" ]] && {
      [[ "$LoadNum" -eq '1' ]] && INSERTGRUB="$(expr ${CFG11[0]} + 1)" || INSERTGRUB="$(awk '/submenu |menuentry /{print NR}' $GRUBDIR/$GRUBFILE|head -n 2|tail -n 1)";
      REBOOTNO=1;
    }
    [[ -z "$needguess" ]] && {
      INSERTGRUB="$(expr ${CFG00} - 1)";
      REBOOTNO=1;

      if grep -q '^insmod blscfg$' $GRUBDIR/$GRUBFILE && grep -q '^blscfg$' $GRUBDIR/$GRUBFILE; then
        beforenum="$(awk '/^blscfg$/ {exit} /^menuentry / {count++} END{print count+0}' "$GRUBDIR/$GRUBFILE")"
        blscfgnum="$(find /boot/loader/entries -maxdepth 1 -type f | wc -l)"
        blsline="$(grep -n '^blscfg$' "$GRUBDIR/$GRUBFILE" | cut -d: -f1)"
        if [ "$INSERTGRUB" -lt "$blsline" ]; then INSERTGRUB=$((blsline + 1));REBOOTNO=$((beforenum + blscfgnum)); fi
      fi
    }

    echo -en "[ \033[32m grubline: $INSERTGRUB, rebootno: $REBOOTNO \033[0m ]"
  }
  [[ "$GRUBTYPE" == '3' ]] && {
    CFG0="$(awk '/title[\ ]|title[\t]/{print NR}' $GRUBDIR/$GRUBFILE|head -n 1)";
    CFG1="$(awk '/title[\ ]|title[\t]/{print NR}' $GRUBDIR/$GRUBFILE|head -n 2 |tail -n 1)";
    [[ -n $CFG0 ]] && [ -z $CFG1 -o $CFG1 == $CFG0 ] && sed -n "$CFG0,$"p $GRUBDIR/$GRUBFILE >$remasteringdir/boot/grub.new;
    [[ -n $CFG0 ]] && [ -z $CFG1 -o $CFG1 != $CFG0 ] && sed -n "$CFG0,$[$CFG1-1]"p $GRUBDIR/$GRUBFILE >$remasteringdir/boot/grub.new;
    [[ ! -f $remasteringdir/boot/grub.new ]] && echo "Error! configure append $GRUBFILE. " && exit 1;
    sed -i "/title.*/c\title\ \'DebianNetboot \[buster\ amd64\]\'" $remasteringdir/boot/grub.new;
    sed -i '/^#/d' $remasteringdir/boot/grub.new;
    INSERTGRUB="$(awk '/title[\ ]|title[\t]/{print NR}' $GRUBDIR/$GRUBFILE|head -n 1)"
  }


[[ "$GRUBTYPE" == '11' ]] && {

    READGRUB=''$remasteringdir'/boot/grub.read'

    cat $GRUBDIR/$GRUBFILE |sed 's/\r//g' |sed -n '1h;1!H;$g;s/\n/%%%%%%%/g;$p' |grep -a -om 1 'menuentry [^{]*{[^}]*}%%%%%%%' |sed 's/%%%%%%%/\n/g' >$READGRUB
    LoadNum="$(cat $READGRUB |grep -c 'menuentry ')"
    if [[ "$LoadNum" -eq '1' ]]; then
      cat $READGRUB |sed '/^$/d' >$remasteringdir/boot/grub.new;
    elif [[ "$LoadNum" -gt '1' ]]; then
      CFG0="$(awk '/menuentry /{print NR}' $READGRUB|head -n 1)";
      CFG2="$(awk '/menuentry /{print NR}' $READGRUB|head -n 2 |tail -n 1)";
      CFG1="";
      for tmpCFG in `awk '/}/{print NR}' $READGRUB`
        do
          [ "$tmpCFG" -gt "$CFG0" -a "$tmpCFG" -lt "$CFG2" ] && CFG1="$tmpCFG";
        done
      [[ -z "$CFG1" ]] && {
        echo "Error! read $GRUBFILE. ";
        exit 1;
      }

      sed -n "$CFG0,$CFG1"p $READGRUB >$remasteringdir/boot/grub.new;
      [[ -f $remasteringdir/boot/grub.new ]] && [[ "$(grep -c '{' $remasteringdir/boot/grub.new)" -eq "$(grep -c '}' $remasteringdir/boot/grub.new)" ]] || {
        echo -ne "\033[31m Error! \033[0m Not configure $GRUBFILE. \n";
        exit 1;
      }
    fi
    [ ! -f $remasteringdir/boot/grub.new ] && echo "Error! process $GRUBFILE. " && exit 1;
    sed -i ':a;N;$!ba;s/menuentry.*{/menuentry\ '"'"'COLXC \[cooperlxclinux\ withrecoveryandhypervinside\]'"'"'\ --class bootinfo\ --class\ icon-bootinfo\ \{/g;s/{.*}/{\n\tlinux\ \/vmlinuz_1kddinst\n\tinitrd\ \/initrfs_1kddinst.img\n}/g' $remasteringdir/boot/grub.new
    sed -i "/echo.*Loading/d" $remasteringdir/boot/grub.new;

    CFG00="$(awk '/menuentry /{print NR}' $GRUBDIR/$GRUBFILE|head -n 1)";
    CFG11=()
    for tmptmpCFG in `awk '/}/{print NR}' $GRUBDIR/$GRUBFILE`
    do
      [ "$tmptmpCFG" -gt "$CFG00" ] && CFG11+=("$tmptmpCFG");
    done

    [[ "$LoadNum" -eq '1' ]] && INSERTGRUB="$(expr ${CFG11[0]} + 1)" || INSERTGRUB="$(awk '/submenu |menuentry /{print NR}' $GRUBDIR/$GRUBFILE|head -n 1)"
    echo -en "[ \033[32m grubline: $INSERTGRUB \033[0m ]"
  }

  [[ "$GRUBTYPE" == '10' ]] && {

    >$remasteringdir/boot/grub.new
    tee -a $remasteringdir/boot/grub.new > /dev/null <<EOF
set timeout=0
set default=0

set root=(memdisk)

insmod efi_gop

menuentry "COLXC" {
    # "/" automatically references the (memdisk)-volume
    # for other volumes, the path would be "(hd0)/boot/..." for example
    linux /boot/vmlinuz
    initrd /boot/initrfs.img
}
menuentry "osx(avaliable till grub supports apfs)" {
    chainloader /System/Library/CoreServices
}
EOF

  }

  [[ "$tmpBUILD" != "1" && "$tmpBUILD" != "11" ]] && [[ "$tmpTARGETMODE" != "1" ]] && {

    [[ -n "$(grep 'linux.*/\|kernel.*/' $remasteringdir/boot/grub.new |awk '{print $2}' |tail -n 1 |grep '^/boot/')" ]] && Type='InBoot' || Type='NoBoot';

    LinuxKernel="$(grep 'linux.*/\|kernel.*/' $remasteringdir/boot/grub.new |awk '{print $1}' |head -n 1)";
    [[ -z "$LinuxKernel" ]] && echo "Error! read grub config! " && exit 1;
    LinuxIMG="$(grep 'initrd.*/' $remasteringdir/boot/grub.new |awk '{print $1}' |tail -n 1)";
    [ -z "$LinuxIMG" ] && sed -i "/$LinuxKernel.*\//a\\\tinitrd\ \/" $remasteringdir/boot/grub.new && LinuxIMG='initrd';

    Add_OPTION=""
    Add_OPTION="$Add_OPTION debian-installer/framebuffer=false"
    [[ "$tmpINSTSSHONLY" == '1' ]] && Add_OPTION="$Add_OPTION DEBIAN_FRONTEND=text"
    [[ "$tmpTARGET" == 'dummy' && "$tmpINSTWITHMANUAL" == '1' ]] && Add_OPTION="$Add_OPTION rescue/enable=true"
    [[ $tmpTARGET != 'debian' ]] && Add_OPTION="$Add_OPTION standardmodules=false"
    Add_OPTION="$Add_OPTION interface=$IFETH $([ "$setNet" == '1' -a "$FORCENETCFGSTR" != '' ] && echo "ipaddress=$FIP netmask=$FMASK gateway=$FGATE";[ "$setNet" != '1' ] && [ "$IP" != '' -a "$MASK" != '' -a "$GATE" != '' ] && echo "ipaddress=$IP netmask=$MASK gateway=$GATE")"
    Add_OPTION="$Add_OPTION mirrorhostname=$DEBMIRROR mirrordirectory=/_build/debianbase"

    BOOT_OPTION="console=ttyS0,115200n8 console=tty0 auto=true $Add_OPTION $([[ $dipreseedearlycommandstring != '' ]] && echo preseedearlycommand=\"$dipreseedearlycommandstring\") partmanearlycommand=\"$dipartmanearlycommandstring\" $([[ $dipreseedlatecommandstring != '' ]] && echo preseedlatecommand=\"$dipreseedlatecommandstring\") hostname=debian domain= -- quiet";

    [[ "$Type" == 'InBoot' ]] && {
      sed -i "/$LinuxKernel.*\//c\\\t$LinuxKernel\\t\/boot\/vmlinuz_1kddinst $BOOT_OPTION" $remasteringdir/boot/grub.new;
      sed -i "/$LinuxIMG.*\//c\\\t$LinuxIMG\\t\/boot\/initrfs_1kddinst.img" $remasteringdir/boot/grub.new;
    }

    [[ "$Type" == 'NoBoot' ]] && {
      sed -i "/$LinuxKernel.*\//c\\\t$LinuxKernel\\t\/vmlinuz_1kddinst $BOOT_OPTION" $remasteringdir/boot/grub.new;
      sed -i "/$LinuxIMG.*\//c\\\t$LinuxIMG\\t\/initrfs_1kddinst.img" $remasteringdir/boot/grub.new;
    }
  }

  [[ "$tmpBUILD" == "11" ]] && [[ "$tmpTARGETMODE" != "1" ]] && {

    LinuxKernel="linux";
    LinuxIMG="initrd";

    Add_OPTION=""
    Add_OPTION="$Add_OPTION debian-installer/framebuffer=false"
    [[ "$tmpINSTSSHONLY" == '1' ]] && Add_OPTION="$Add_OPTION DEBIAN_FRONTEND=text"
    [[ "$tmpTARGET" == 'dummy' && "$tmpINSTWITHMANUAL" == '1' ]] && Add_OPTION="$Add_OPTION rescue/enable=true"
    [[ $tmpTARGET != 'debian' ]] && Add_OPTION="$Add_OPTION standardmodules=false"
    Add_OPTION="$Add_OPTION interface=$IFETH ipaddress=$([[ $setNet == '1' && $FORCENETCFGSTR != '' ]] && echo $FIP || echo $IP) netmask=$([[ $setNet == '1' && $FORCENETCFGSTR != '' ]] && echo $FMASK || echo $MASK) gateway=$([[ $setNet == '1' && $FORCENETCFGSTR != '' ]] && echo $FGATE || echo $GATE)"
    Add_OPTION="$Add_OPTION mirrorhostname=$DEBMIRROR mirrordirectory=/_build/debianbase"

    BOOT_OPTION="console=ttyS0,115200n8 console=tty0 auto=true $Add_OPTION $([[ $dipreseedearlycommandstring != '' ]] && echo preseedearlycommand=\"$dipreseedearlycommandstring\") partmanearlycommand=\"$dipartmanearlycommandstring\" $([[ $dipreseedlatecommandstring != '' ]] && echo preseedlatecommand=\"$dipreseedlatecommandstring\") hostname=debian domain= -- quiet";

    sed -i "/$LinuxKernel.*\//c\\\t$LinuxKernel\\t\\\$prefix\/vmlinuz_1kddinst $BOOT_OPTION" $remasteringdir/boot/grub.new;
    sed -i "/$LinuxIMG.*\//c\\\t$LinuxIMG\\t\\\$prefix\/initrfs_1kddinst.img" $remasteringdir/boot/grub.new;

  }

  [[ "$tmpBUILD" == "1" ]] && [[ "$tmpTARGETMODE" != "1" ]] && {

    LinuxKernel="linux";
    LinuxIMG="initrd";

    Add_OPTION=""
    Add_OPTION="$Add_OPTION debian-installer/framebuffer=false"
    [[ "$tmpINSTSSHONLY" == '1' ]] && Add_OPTION="$Add_OPTION DEBIAN_FRONTEND=text"
    [[ "$tmpTARGET" == 'dummy' && "$tmpINSTWITHMANUAL" == '1' ]] && Add_OPTION="$Add_OPTION rescue/enable=true"
    [[ $tmpTARGET != 'debian' ]] && Add_OPTION="$Add_OPTION standardmodules=false"
    Add_OPTION="$Add_OPTION interface=$IFETH ipaddress=$([[ $setNet == '1' && $FORCENETCFGSTR != '' ]] && echo $FIP || echo $IP) netmask=$([[ $setNet == '1' && $FORCENETCFGSTR != '' ]] && echo $FMASK || echo $MASK) gateway=$([[ $setNet == '1' && $FORCENETCFGSTR != '' ]] && echo $FGATE || echo $GATE)"
    Add_OPTION="$Add_OPTION mirrorhostname=$DEBMIRROR mirrordirectory=/_build/debianbase"

    BOOT_OPTION="console=ttyS0,115200n8 console=tty0 auto=true $Add_OPTION $([[ $dipreseedearlycommandstring != '' ]] && echo preseedearlycommand=\"$dipreseedearlycommandstring\") partmanearlycommand=\"$dipartmanearlycommandstring\" $([[ $dipreseedlatecommandstring != '' ]] && echo preseedlatecommand=\"$dipreseedlatecommandstring\") hostname=debian domain= -- quiet";

    sed -i "" "s/$LinuxKernel.*/$LinuxKernel \/vmlinuz_1kddinst $BOOT_OPTION/g" $remasteringdir/boot/grub.new;
    sed -i "" "s/$LinuxIMG.*/$LinuxIMG \/initrfs_1kddinst.img/g" $remasteringdir/boot/grub.new;

  }

  [[ "$tmpBUILD" != "1" ]] && sed -i '$a\\n' $remasteringdir/boot/grub.new || sed -i "" $'$a\\\n\n' $remasteringdir/boot/grub.new;

}

patchgrub(){

  [[ "$tmpDEBUG" == "2" ]] && return;
  GRUBPATCH='0';

  if [[ "$tmpBUILD" != "1" && "$tmpTARGETMODE" != '1' || "$tmpBUILDINSTTEST" == '1' ]]; then

    sed -i ''${INSERTGRUB}'i\\n' $GRUBDIR/$GRUBFILE;
    sed -i ''${INSERTGRUB}'r '$remasteringdir'/boot/grub.new' $GRUBDIR/$GRUBFILE;

    sed -i 's/timeout_style=hidden/timeout_style=menu/g' $GRUBDIR/$GRUBFILE;
    sed -i 's/timeout=[0-9]*/timeout=0/g' $GRUBDIR/$GRUBFILE;

    [[ "$tmpBUILDINSTTEST" == '1' ]] && sed -e 's/vmlinuz_1kddinst/vmlinuz_1kddlocaltest live/g' -e 's/initrfs_1kddinst.img/initrfs_1kddlocaltest.img/g' -i $GRUBDIR/$GRUBFILE;

    [[ -f $GRUBDIR/grubenv ]] && sed -i 's/saved_entry/#saved_entry/g' $GRUBDIR/grubenv;
  fi

}

restoreall(){

  [[ "$1" == 'dnsonly' ]] && {
    [[ -f /etc/resolv.conf.bak ]] && cp -f /etc/resolv.conf.bak /etc/resolv.conf
    [[ -f /etc/resolv.conf.old ]] && cp -f /etc/resolv.conf.old /etc/resolv.conf
  } || {
    [[ -f /etc/resolv.conf.bak ]] && cp -f /etc/resolv.conf.bak /etc/resolv.conf
    [[ -f /etc/resolv.conf.old ]] && cp -f /etc/resolv.conf.old /etc/resolv.conf
    [[ -f $GRUBDIR/$GRUBFILE.bak ]] && cp -f $GRUBDIR/$GRUBFILE.bak $GRUBDIR/$GRUBFILE
    [[ -f $GRUBDIR/$GRUBFILE.old ]] && cp -f $GRUBDIR/$GRUBFILE.old $GRUBDIR/$GRUBFILE

    [[ "$tmpBUILD" != "1" && "$tmpBUILD" != "11" ]] && [[ "$tmpTARGETMODE" != "1" ]] && grub-reboot 0
    [[ "$tmpBUILD" == "11" ]] && [[ "$tmpTARGETMODE" != "1" ]] && { GRUBID=`bcdedit /enum ACTIVE|sed 's/\r//g'|tail -n4|head -n 1|awk -F ' ' '{ print $2}'`;bcdedit /enum all | grep --text $GRUBID && bcdedit /bootsequence $GRUBID /remove; }

  }

}

install_lxc(){
  apt-get update -y -qq --allow-releaseinfo-change --allow-unauthenticated --allow-insecure-repositories > /dev/null 2>&1
  apt-get install -y -qq --no-install-recommends bridge-utils iptables \
  python3 \
  libnl-3-200 \
  apparmor libbsd0 libfuse2 libgnutlsxx28 libmd0 libnet1 libprotobuf-c1 libprotobuf23 python3-pkg-resources python3-protobuf python3-six uidmap \
  libapparmor1 > /dev/null 2>&1
  dpkg -i $downdir/debianbase/{criu_3.15-1-pve-1_amd64.deb,lxcfs_5.0.3-pve1_amd64.deb,lxc-pve_5.0.2-2_amd64.deb} > /dev/null 2>&1

  echo -en "[ \033[32m lxc \033[0m ]"
}

install_pve(){
  apt-get update -y -qq --allow-releaseinfo-change --allow-unauthenticated --allow-insecure-repositories > /dev/null 2>&1
  apt-get install -y -qq --no-install-recommends perl libclone-perl libjson-perl liblinux-inotify2-perl libhttp-daemon-perl libdevel-cycle-perl libfilesys-df-perl libstring-shellquote-perl libnet-ip-perl libnet-ssleay-perl libqb100 libcrypt-openssl-random-perl libcrypt-openssl-rsa-perl libmime-base32-perl libwww-perl libnet-ldap-perl libauthen-pam-perl libyaml-libyaml-perl libdigest-hmac-perl libuuid-perl \
  libnetaddr-ip-perl libposix-strptime-perl \
  libcpg4 libcmap4 libquorum5 libglib2.0-0 libfuse2 libsqlite3-0 librrd8 \
  librados2 libapt-pkg-perl libnet-dns-perl libnet-dbus-perl libanyevent-http-perl libanyevent-perl libio-stringy-perl libio-multiplex-perl libfile-chdir-perl libfile-readbackwards-perl librrds-perl libtemplate-perl \
  faketime \
  libcurl3-gnutls libjpeg62-turbo > /dev/null 2>&1
  dpkg -i $downdir/debianbase/{libjs-extjs_7.0.0-1_all.deb,novnc-pve_1.4.0-1_all.deb,pve-xtermjs_4.16.0-1_amd64.deb,vncterm_1.7-1_amd64.deb,pve-lxc-syscalld_1.2.2-1_amd64.deb} > /dev/null 2>&1
  apt-get install -y -qq --no-install-recommends fonts-font-awesome dtach > /dev/null 2>&1

  apt-get install -y -qq --no-install-recommends isc-dhcp-server > /dev/null 2>&1
  sed -i 's/INTERFACESv4=""/INTERFACESv4="vmbr1"/g' /etc/default/isc-dhcp-server;
  echo -e "subnet 10.10.10.0 netmask 255.255.255.0 {\noption routers 10.10.10.254;\noption subnet-mask 255.255.255.0;\noption domain-name-servers 8.8.8.8;\nrange 10.10.10.1 10.10.10.253;\n}" >> /etc/dhcp/dhcpd.conf

  echo -en "[ \033[32m pve \033[0m ]"
}

url_check() {
  http_status=$(curl -o /dev/null -s -w "%{http_code}\n" "$1")
  if [ "$http_status" != 200 -a "$http_status" != 301 -a "$http_status" != 302 -a "$http_status" != 307 -a "$http_status" != 308 ]; then
    msg_error "url is not curlable,app missing?"
    exit
  fi
}

cfg_check() {
  resp_all=$(curl -s -w "\n%{http_code}" "$1")
  http_code=$(tail -n1 <<< "$resp_all")
  if [ "$http_code" == 200 -o "$http_code" == 301 -o "$http_code" == 302 -o "$http_code" == 307 -o "$http_code" == 308 ]; then
    sed '$ d' <<< "$resp_all"
  fi
}

build_container() {

  if [ "$CT_TYPE" == "1" ]; then
    FEATURES="keyctl=1,nesting=1"
  else
    FEATURES="nesting=1"
  fi


  TEMP_DIR=$(mktemp -d)
  pushd $TEMP_DIR >/dev/null
  if [ "$var_os" == "alpine" ]; then
    export FUNCTIONS_FILE_PATH=""
  else
    export FUNCTIONS_FILE_PATH=""
  fi
  export CACHER="$APT_CACHER"
  export CACHER_IP="$APT_CACHER_IP"
  export tz="$timezone"
  export DISABLEIPV6="$DISABLEIP6"
  export APPLICATION="$APP"
  export app="$NSAPP"
  export PASSWORD="$PW"
  export VERBOSE="$VERB"
  export SSH_ROOT="${SSH}"
  export CTID="$CT_ID"
  export CTTYPE="$CT_TYPE"
  export PCT_OSTYPE="$var_os"
  export PCT_OSVERSION="$var_version"
  export PCT_DISK_SIZE="$DISK_SIZE"
  export PCT_OPTIONS="
    -features $FEATURES
    -hostname $HN
    $SD
    $NS
    -net0 name=eth0,bridge=$BRG$MAC,ip=$NET$GATE$VLAN$MTU
    -onboot 1
    -cores $CORE_COUNT
    -memory $RAM_SIZE
    -unprivileged $CT_TYPE
    $PW
  "
msg_info "Validating Storage"
VALIDCT=$(pvesm status -content rootdir | awk 'NR>1')
if [ -z "$VALIDCT" ]; then
  msg_error "Unable to detect a valid Container Storage location."
  exit 1
fi
VALIDTMP=$(pvesm status -content vztmpl | awk 'NR>1')
if [ -z "$VALIDTMP" ]; then
  msg_error "Unable to detect a valid Template Storage location."
  exit 1
fi

function select_storage() {
  local CLASS=$1
  local CONTENT
  local CONTENT_LABEL
  case $CLASS in
  container)
    CONTENT='rootdir'
    CONTENT_LABEL='Container'
    ;;
  template)
    CONTENT='vztmpl'
    CONTENT_LABEL='Container template'
    ;;
  *) false || exit "Invalid storage class." ;;
  esac
  
  local -a MENU
  while read -r line; do
    local TAG=$(echo $line | awk '{print $1}')
    local TYPE=$(echo $line | awk '{printf "%-10s", $2}')
    local FREE=$(echo $line | numfmt --field 4-6 --from-unit=K --to=iec --format %.2f | awk '{printf( "%9sB", $6)}')
    local ITEM="  Type: $TYPE Free: $FREE "
    local OFFSET=2
    if [[ $((${#ITEM} + $OFFSET)) -gt ${MSG_MAX_LENGTH:-} ]]; then
      local MSG_MAX_LENGTH=$((${#ITEM} + $OFFSET))
    fi
    MENU+=("$TAG" "$ITEM" "OFF")
  done < <(pvesm status -content $CONTENT | awk 'NR>1')
  
  if [ $((${#MENU[@]}/3)) -eq 1 ]; then
    printf ${MENU[0]}
  else
    local STORAGE
    while [ -z "${STORAGE:+x}" ]; do
      STORAGE=$(whiptail --backtitle "Proxmox VE Helper Scripts" --title "Storage Pools" --radiolist \
      "Which storage pool you would like to use for the ${CONTENT_LABEL,,}?\nTo make a selection, use the Spacebar.\n" \
      16 $(($MSG_MAX_LENGTH + 23)) 6 \
      "${MENU[@]}" 3>&1 1>&2 2>&3) || exit "Menu aborted."
    done
    printf $STORAGE
  fi
}

[[ "${CTID:-}" ]] || exit "You need to set 'CTID' variable."
[[ "${PCT_OSTYPE:-}" ]] || exit "You need to set 'PCT_OSTYPE' variable."

if pct status $CTID &>/dev/null; then
  echo -e "ID '$CTID' is already in use."
  unset CTID
  exit "Cannot use ID that is already in use."
fi

TEMPLATE_STORAGE=$(select_storage template) || exit
msg_ok "Using ${BL}$TEMPLATE_STORAGE${CL} ${GN}for Template Storage."

CONTAINER_STORAGE=$(select_storage container) || exit
msg_ok "Using ${BL}$CONTAINER_STORAGE${CL} ${GN}for Container Storage."

<<'BLOCK'

msg_info "Updating LXC Template List"
pveam update >/dev/null
msg_ok "Updated LXC Template List"

TEMPLATE_SEARCH=${PCT_OSTYPE}-${PCT_OSVERSION:-}
mapfile -t TEMPLATES < <(pveam available -section system | sed -n "s/.*\($TEMPLATE_SEARCH.*\)/\1/p" | sort -t - -k 2 -V)
[ ${#TEMPLATES[@]} -gt 0 ] || exit "Unable to find a template when searching for '$TEMPLATE_SEARCH'."
TEMPLATE="${TEMPLATES[-1]}"

if ! pveam list $TEMPLATE_STORAGE | grep -q $TEMPLATE; then
  msg_info "Downloading LXC Template"
  pveam download $TEMPLATE_STORAGE $TEMPLATE >/dev/null ||
    exit "A problem occured while downloading the LXC template."
  msg_ok "Downloaded LXC Template"
fi

BLOCK

TEMPLATE="lxcdebtpl.tar.xz"

DEFAULT_PCT_OPTIONS=(
  -arch $(dpkg --print-architecture))

PCT_OPTIONS=(${PCT_OPTIONS[@]:-${DEFAULT_PCT_OPTIONS[@]}})
[[ " ${PCT_OPTIONS[@]} " =~ " -rootfs " ]] || PCT_OPTIONS+=(-rootfs $CONTAINER_STORAGE:${PCT_DISK_SIZE:-8})

msg_info "Creating LXC Container"
pct create $CTID ${TEMPLATE_STORAGE}:vztmpl/${TEMPLATE} ${PCT_OPTIONS[@]} >/dev/null ||
  exit "A problem occured while trying to create container."
msg_ok "LXC Container ${BL}$CTID${CL} ${GN}was successfully created."

########################################################

  LXC_CONFIG=/etc/pve/lxc/${CTID}.conf
  
  if [ "$CT_TYPE" == "0" ]; then
    cat <<EOF >>$LXC_CONFIG
# USB passthrough
lxc.cgroup2.devices.allow: a
lxc.cap.drop:
lxc.cgroup2.devices.allow: c 188:* rwm
lxc.cgroup2.devices.allow: c 189:* rwm
lxc.mount.entry: /dev/serial/by-id  dev/serial/by-id  none bind,optional,create=dir
lxc.mount.entry: /dev/ttyUSB0       dev/ttyUSB0       none bind,optional,create=file
lxc.mount.entry: /dev/ttyUSB1       dev/ttyUSB1       none bind,optional,create=file
lxc.mount.entry: /dev/ttyACM0       dev/ttyACM0       none bind,optional,create=file
lxc.mount.entry: /dev/ttyACM1       dev/ttyACM1       none bind,optional,create=file
# tun
lxc.cgroup2.devices.allow: c 10:200 rwm
lxc.mount.entry: /dev/net dev/net none bind,create=dir
# VAAPI hardware transcoding
lxc.cgroup2.devices.allow: c 226:0 rwm
lxc.cgroup2.devices.allow: c 226:128 rwm
lxc.cgroup2.devices.allow: c 29:0 rwm
lxc.mount.entry: /dev/fb0 dev/fb0 none bind,optional,create=file
lxc.mount.entry: /dev/dri dev/dri none bind,optional,create=dir
lxc.mount.entry: /dev/dri/renderD128 dev/dri/renderD128 none bind,optional,create=file
# kvm
lxc.cgroup2.devices.allow: c 10:232 rwm
# loop
lxc.cgroup2.devices.allow: b 7:* rwm
lxc.cgroup2.devices.allow: c 10:237 rwm
lxc.mount.entry: /dev/loop0 dev/loop0 none bind,create=file 0 0
lxc.mount.entry: /dev/loop1 dev/loop1 none bind,create=file 0 0
lxc.mount.entry: /dev/loop2 dev/loop2 none bind,create=file 0 0
lxc.mount.entry: /dev/loop3 dev/loop3 none bind,create=file 0 0
lxc.mount.entry: /dev/loop4 dev/loop4 none bind,create=file 0 0
lxc.mount.entry: /dev/loop5 dev/loop5 none bind,create=file 0 0
lxc.mount.entry: /dev/loop6 dev/loop6 none bind,create=file 0 0
lxc.mount.entry: /dev/loop-control dev/loop-control none bind,create=file 0 0
EOF

  fi

  cfg_check "${REPO}/${APP}/${APP}.conf" | sed '/unprivileged:.*/d;/defport:.*/d' >>$LXC_CONFIG

}

buildinstfuncs(){
  IFS='' read -r -d '' setting_up_container <<"EOFF"
  echo "Setting up Container OS"
  sed -i "/$LANG/ s/\(^# \)//" /etc/locale.gen
  locale_line=$(grep -v '^#' /etc/locale.gen | grep -E '^[a-zA-Z]' | awk '{print $1}' | head -n 1)
  echo "LANG=${locale_line}" >/etc/default/locale
  locale-gen >/dev/null
  export LANG=${locale_line}
  echo $tz >/etc/timezone
  ln -sf /usr/share/zoneinfo/$tz /etc/localtime
  for ((i = RETRY_NUM; i > 0; i--)); do
    if [ "$(hostname -I)" != "" ]; then
      break
    fi
    echo 1>&2 -en "${CROSS}${RD} No Network! "
    sleep $RETRY_EVERY
  done
  if [ "$(hostname -I)" = "" ]; then
    echo 1>&2 -e "\n${CROSS}${RD} No Network After $RETRY_NUM Tries${CL}"
    echo -e " 🖧  Check Network Settings"
    exit 1
  fi
  rm -rf /usr/lib/python3.*/EXTERNALLY-MANAGED

  echo "Set up Container OS"
  echo "Network Connected: ${BL}$(hostname -I)"
EOFF

  IFS='' read -r -d '' network_check <<"EOFF"
  set +e
  trap - ERR
  ipv4_connected=false
  ipv6_connected=false
  sleep 1

  if ping -c 1 -W 1 1.1.1.1 &>/dev/null; then 
    echo "IPv4 Internet Connected";
    ipv4_connected=true
  else
    echo "IPv4 Internet Not Connected";
  fi

  if ping6 -c 1 -W 1 2606:4700:4700::1111 &>/dev/null; then
    echo "IPv6 Internet Connected";
    ipv6_connected=true
  else
    echo "IPv6 Internet Not Connected";
  fi

  # If both IPv4 and IPv6 checks fail, prompt the user
  if [[ $ipv4_connected == false && $ipv6_connected == false ]]; then
    read -r -p "No Internet detected,would you like to continue anyway? <y/N> " prompt </dev/tty
    if [[ "${prompt,,}" =~ ^(y|yes)$ ]]; then
      echo -e " ⚠️  ${RD}Expect Issues Without Internet${CL}"
    else
      echo -e " 🖧  Check Network Settings"
      exit 1
    fi
  fi

  RESOLVEDIP=$(getent hosts github.com | awk '{ print $1 }')
  if [[ -z "$RESOLVEDIP" ]]; then echo "DNS Lookup Failure"; else echo "DNS Resolved github.com to ${BL}$RESOLVEDIP${CL}"; fi
  set -e
  trap 'error_handler $LINENO "$BASH_COMMAND"' ERR
EOFF

  IFS='' read -r -d '' update_os <<"EOFF"
  silent() { "$@" >/dev/null 2>&1; }
  echo "Updating Container OS"
  if [[ "$CACHER" == "yes" ]]; then
    echo "Acquire::http::Proxy-Auto-Detect \"/usr/local/bin/apt-proxy-detect.sh\";" >/etc/apt/apt.conf.d/00aptproxy
    cat <<EOF >/usr/local/bin/apt-proxy-detect.sh
#!/bin/bash
if nc -w1 -z "${CACHER_IP}" 3142; then
  echo -n "http://${CACHER_IP}:3142"
else
  echo -n "DIRECT"
fi
EOF
  chmod +x /usr/local/bin/apt-proxy-detect.sh
  fi
   silent apt-get update
   silent apt-get -o Dpkg::Options::="--force-confold" -y dist-upgrade
  rm -rf /usr/lib/python3.*/EXTERNALLY-MANAGED
  echo "Updated Container OS"
EOFF

  IFS='' read -r -d '' motd_ssh <<"EOFF"
  echo "export TERM='xterm-256color'" >>/root/.bashrc
  echo -e "$APPLICATION LXC provided by xxx\n" >/etc/motd
  chmod -x /etc/update-motd.d/*
  if [[ "${SSH_ROOT}" == "yes" ]]; then
    sed -i "s/#PermitRootLogin prohibit-password/PermitRootLogin yes/g" /etc/ssh/sshd_config
    systemctl restart sshd
  fi
EOFF

  IFS='' read -r -d '' customize <<"EOFF"
  if [[ "$PASSWORD" == "" ]]; then
    echo "Customizing Container"
    GETTY_OVERRIDE="/etc/systemd/system/container-getty@1.service.d/override.conf"
    mkdir -p $(dirname $GETTY_OVERRIDE)
    cat <<EOF >$GETTY_OVERRIDE
  [Service]
  ExecStart=
  ExecStart=-/sbin/agetty --autologin root --noclear --keep-baud tty%I 115200,38400,9600 \$TERM
EOF
    systemctl daemon-reload
    systemctl restart $(basename $(dirname $GETTY_OVERRIDE) | sed 's/\.d//')
    echo "Customized Container"
  fi
  chmod +x /usr/bin/update
EOFF
}

conf_list(){
    cat $iptablesconf
}
conf_add(){
    if [ ! -f $iptablesconf ];then
        echo "warn!"
        exit 1
    fi
    echo "IP(def:10.10.10.x)"
    [ -z "$confvmip" ] && read -p "(Default: Exit):" confvmip </dev/tty
    [ -z "$confvmip" ] && exit 1
    echo
    echo "IP = $confvmip"
    echo
    while true
    do
    echo "choose:"
    [ -z "$confvmport" ] && read -p "(def: 80):" confvmport </dev/tty
    [ -z "$confvmport" ] && confvmport="80"
    expr $confvmport + 0 &>/dev/null
    if [ $? -eq 0 ]; then
        if [ $confvmport -ge 1 ] && [ $confvmport -le 65535 ]; then
            echo
            echo "vm_port = $confvmport"
            echo
            break
        else
            echo "def 1-65535!"
        fi
    else
        echo "def 1-65535!"
    fi
    done
    echo
    while true
    do
    echo "next"
    [ -z "$natconfport" ] && read -p "(Default: Exit):" natconfport </dev/tty
    [ -z "$natconfport" ] && exit 1
    expr $natconfport + 0 &>/dev/null
    if [ $? -eq 0 ]; then
        if [ $natconfport -ge 1 ] && [ $natconfport -le 65535 ]; then
            echo
            echo "natport = $natconfport"
            echo
            break
        else
            echo "port 1-65535!"
        fi
    else
        echo "port 1-65535!"
    fi
    done
    echo "(tcp or udp):"
    [ -z "$conftype" ] && read -p "(port: tcp):" conftype </dev/tty
    [ -z "$conftype" ] && conftype="tcp"
    echo
    echo "conf_type= $conftype"
    echo
    iptablesshell="iptables -t nat -A CUSTOM_RULES -i vmbr0 -p $conftype --dport $natconfport -j DNAT --to-destination $confvmip:$confvmport"
    if [ `grep -c "$iptablesshell" $iptablesconf` != '0' ]; then
        echo "next"
        exit 1
    fi
    get_char(){
        SAVEDSTTY=`stty -g`
        stty -echo
        stty cbreak
        dd if=/dev/tty bs=1 count=1 2> /dev/null
        stty -raw
        stty echo
        stty $SAVEDSTTY
    }
    echo
    echo "Ctrl+C"
    [[ $# -eq 1 ]] && char=`get_char`
    echo $iptablesshell >> $iptablesconf
    runreturn=`$iptablesshell`
    echo $runreturn
    echo 'answ'
}
add_confs(){
    conf_add
}
del_conf(){
    echo
    while true
    do
    echo "next"
    read -p "(dev: ans):" confserverport </dev/tty
    [ -z "$confserverport" ] && exit 1
    expr $confserverport + 0 &>/dev/null
    if [ $? -eq 0 ]; then
        if [ $confserverport -ge 1 ] && [ $confserverport -le 65535 ]; then
           echo
           echo "serv_port = $confserverport"
           echo
           break
        else
           echo "def 1-65535!"
        fi
    else
        echo "def 1-65535!"
    fi
    done
    echo
    iptablesshelldel=`cat $iptablesconf | grep "dport $confserverport"`
    if [ ! -n "$iptablesshelldel" ]; then
         echo "next"
         exit 1
    fi
    iptablesshelldelshell=`echo ${iptablesshelldel//-A/-D}`
    runreturn=`$iptablesshelldelshell`
    echo $runreturn
    sed -i "/$iptablesshelldel/d" $iptablesconf
    echo 'next'
}
del_confs(){
    printf "answer (y/n) "
    printf "\n"
    read -p "(def: n):" answer </dev/tty
    if [ -z $answer ]; then
       answer="n"
    fi
    if [ "$answer" = "y" ]; then
       del_conf
   else
       echo "next"
   fi
}
refresh_confs(){
    iptables -t nat -D PREROUTING -j CUSTOM_RULES >/dev/null 2>&1;iptables -t nat -F CUSTOM_RULES >/dev/null 2>&1;iptables -t nat -X CUSTOM_RULES >/dev/null 2>&1
    iptables -t nat -N CUSTOM_RULES >/dev/null 2>&1;[[ $? == '0' ]] && { iptables -t nat -A PREROUTING -j CUSTOM_RULES;bash /root/.pvesetnatrc; }
}
applynat(){
    action=$1
    confvmip=$2
    confvmport=$3
    natconfport=$4
    conftype=$5
    case "$action" in
    add)
      add_confs
      ;;
    list)
      conf_list
      ;;
    del)
      del_confs
      ;;
    refresh)
      refresh_confs
      ;;
    *)
    echo "[${action} ]"
    echo "applynat {add|list|del|refresh}"
    ;;
    esac
}

export PATH=.:./tools:../tools:$PATH
CWD="$(pwd)"
topdir=$CWD
cd $topdir
clear

[[ $tmpTARGETMODE != 1 && $forcemaintainmode != 1 ]] && echo "Changing current directory to $CWD"
[[ $tmpTARGETMODE != 1 && $forcemaintainmode != 1 ]] && [[ `command -v "tput"` && `command -v "resize"` ]] && [[ "$(tput cols)" -lt '100'  ]] && resize -s "$(tput lines)" 110 >/dev/null 2>&1

downdir='_tmpdown'
remasteringdir='_tmpremastering'
targetdir='_tmpbuild'
mkdir -p $downdir $remasteringdir $targetdir

[[ $# -eq 0 ]] && {

  while [[ -z "$tmpTARGET" ]]; do

    echo -n "target needed, type a target to go, or any -option to continue: ";trap 'printf \\e[33m' DEBUG;trap 'printf \\e[0m' EXIT;read -p "" NN </dev/tty;trap 'printf \\e[0m' DEBUG
    case $NN in
      -m) read -p "Enter your own FORCEDEBMIRROR directlink (or type to use inbuilt: `echo -e "\033[33mgithub,gitlab\033[0m"`): " FORCEDEBMIRROR </dev/tty;[[ "$FORCEDEBMIRROR" == 'github' ]] && FORCEDEBMIRROR=$autoDEBMIRROR0;[[ "$FORCEDEBMIRROR" == 'gitlab' ]] && FORCEDEBMIRROR=$autoDEBMIRROR1 ;;
      -i) read -p "Enter your own FORCE1STNICNAME (format: `echo -e "\033[33mensp0\033[0m"`): " FORCE1STNICNAME </dev/tty ;;
      -n) read -p "Enter your own FORCENETCFGSTR (format: `echo -e "\033[33m10.211.55.2/24,10.211.55.1\033[0m"`): " FORCENETCFGSTR </dev/tty;[[ -n "$FORCENETCFGSTR" ]] && [[ `echo "$FORCENETCFGSTR" | grep -Eo ":"` != '' ]] && FORCENETCFGV6ONLY=1 ;;
      -6) FORCENETCFGV6ONLY=1;echo "FORCENETCFGV6ONLY set to `echo -e "\033[33m1\033[0m"` " ;;
      -p) read -p "Enter your own FORCE1STHDNAME (format: `echo -e "\033[33mnvme0p1\033[0m"`): " FORCE1STHDNAME </dev/tty ;;
      -w) read -p "Enter your own FORCEPASSWORD (format: `echo -e "\033[33mmypass\033[0m"`): " FORCEPASSWORD </dev/tty ;;
      -o) read -p "Enter your own FORCEINSTCTL (format: `echo -e "\033[33m1=doexpanddisk|2=noinjectnetcfg|3=noreboot|4=nopreclean\033[0m"`): " FORCEINSTCTL </dev/tty ;;
      -d) tmpDEBUG=1;echo "tmpDEBUG set to `echo -e "\033[33m1\033[0m"` ";[[ "$tmpDEBUG" == '1' ]] && [[ "$tmpTARGETMODE" != '1' ]] && tmpINSTWITHMANUAL='1' ;;
      -t) echo "Opsi -t tidak didukung lagi." ;;
    esac;
  done

}

[[ "$(uname)" == "Darwin" ]] && tmpBUILD='1' && echo "osx detected"
[[ -f /cygdrive/c/cygwin64/bin/uname && ( "$(/cygdrive/c/cygwin64/bin/uname -o)" == "Cygwin" || "$(/cygdrive/c/cygwin64/bin/uname -o)" == "Msys") ]] && tmpBUILD='11' && echo "windows detected"
[[ ! $(mount) =~ ^/dev/(sd|vd|nvme|xvd) ]] && [[ ! $(ls /boot 2>/dev/null) =~ grub ]] && [[ "$tmpBUILD" != '1' && "$tmpBUILD" != '11' ]] && { tmpDEBUG=2 && echo "3rd rescue env detected"; }
[[ "$(arch)" == "aarch64" ]] && echo Arm64 detected,will force arch as 1 && tmpHOSTARCH='1'
[[ -d /sys/firmware/efi ]] && echo uefi detected,will force gen as 2 && tmpBUILDGENE='2'
[[ "$tmpBUILD" != "1" && "$tmpBUILD" != "11" ]] && { DEFAULTWORKINGNIC2="$(ip route show |grep -o 'default via [0-9]\{1,3\}.[0-9]\{1,3\}.[0-9]\{1,3\}.[0-9]\{1,3\}.*' |head -n1 |sed 's/proto.*\|onlink.*//g' |awk '{print $NF}')"; [[ -z "$DEFAULTWORKINGNIC2" ]] && { DEFAULTWORKINGNIC2="$(ip -6 -brief route show default |head -n1 |grep -o 'dev .*'|sed 's/proto.*\|onlink.*\|metric.*//g' |awk '{print $NF}')"; }; DEFAULTWORKINGIPSUBV42="$(ip addr |grep ''${DEFAULTWORKINGNIC2}'' |grep 'global' |grep 'brd\|' |head -n1 |grep -o '[0-9]\{1,3\}.[0-9]\{1,3\}.[0-9]\{1,3\}.[0-9]\{1,3\}/[0-9]\{1,2\}')";DEFAULTWORKINGGATEV42="$(ip route show |grep -o 'default via [0-9]\{1,3\}.[0-9]\{1,3\}.[0-9]\{1,3\}.[0-9]\{1,3\}' |head -n1 |grep -o '[0-9]\{1,3\}.[0-9]\{1,3\}.[0-9]\{1,3\}.[0-9]\{1,3\}')";DEFAULTWORKINGIPSUBV62="$(ip -6 -brief address show scope global|grep ''${DEFAULTWORKINGNIC2}'' |awk -F ' ' '{ print $3}')";DEFAULTWORKINGGATEV62="$(ip -6 -brief route show default|grep ''${DEFAULTWORKINGNIC2}'' |awk -F ' ' '{ print $3}')"; [[ -n "$DEFAULTWORKINGIPSUBV42" && -n "$DEFAULTWORKINGGATEV42" ]] || { [[ -n "$DEFAULTWORKINGIPSUBV62" && -n "$DEFAULTWORKINGGATEV62" ]] && echo "IPV6 only detected,will force FORCENETCFGV6ONLY to 1" && FORCENETCFGV6ONLY=1; }; };
[[ "$tmpBUILD" == "11" ]] && { DEFAULTWORKINGNICIDX2="$(netsh int ipv4 show route | grep --text -F '0.0.0.0/0' | awk '$6 ~ /\./ {print $5}')";[[ -z "$DEFAULTWORKINGNICIDX2" ]] && { DEFAULTWORKINGNICIDX2="$(netsh int ipv6 show route | grep --text -F '::/0' | awk '$6 ~ /:/ {print $5}')"; };[[ -n "$DEFAULTWORKINGNICIDX2" ]] && { for i in `echo "$DEFAULTWORKINGNICIDX2"|sed 's/\ /\n/g'`; do if grep -q '=$' <<< `wmic nicconfig where "InterfaceIndex='$i'" get IPAddress /format:list|sed 's/\r//g'|sed 's/IPAddress={//g'|sed 's/\("\|}\)//g'|cut -d',' -f1`; then :; else DEFAULTWORKINGNICIDX2=$i;fi;done;  }; [[ -n "$DEFAULTWORKINGNICIDX2" ]] && DEFAULTWORKINGIPARR1=`echo $(wmic nicconfig where "InterfaceIndex='$DEFAULTWORKINGNICIDX2'" get IPAddress /format:list|sed 's/\r//g'|sed 's/IPAddress={//g'|sed 's/\("\|}\)//g'|cut -d',' -f1)`; DEFAULTWORKINGGATEARR1=`echo $(wmic nicconfig where "InterfaceIndex='$DEFAULTWORKINGNICIDX2'"  get DefaultIPGateway /format:list|sed 's/\r//g'|sed 's/DefaultIPGateway={//g'|sed 's/\("\|}\)//g'|cut -d',' -f1)`; [[ -n "$DEFAULTWORKINGNICIDX2" ]] && DEFAULTWORKINGIPARR2=`echo $(wmic nicconfig where "InterfaceIndex='$DEFAULTWORKINGNICIDX2'" get IPAddress /format:list|sed 's/\r//g'|sed 's/IPAddress={//g'|sed 's/\("\|}\)//g'|cut -d',' -f2)`; DEFAULTWORKINGGATEARR2=`echo $(wmic nicconfig where "InterfaceIndex='$DEFAULTWORKINGNICIDX2'"  get DefaultIPGateway /format:list|sed 's/\r//g'|sed 's/DefaultIPGateway={//g'|sed 's/\("\|}\)//g'|cut -d',' -f2)`; [[ `echo $DEFAULTWORKINGIPARR1|grep -Eo ":"` && `echo $DEFAULTWORKINGIPARR1|grep -Eo ":"` && `echo $DEFAULTWORKINGIPARR2|grep -Eo ":"` && `echo $DEFAULTWORKINGIPARR2|grep -Eo ":"` ]] && echo "IPV6 only detected,will force FORCENETCFGV6ONLY to 1" && FORCENETCFGV6ONLY=1; };
[[ "$tmpBUILD" == "1" ]] && { DEFAULTWORKINGNIC2="$(netstat -nr -f inet|grep default|awk '{print $4}')";[[ -z "$DEFAULTWORKINGNIC2" ]] && { DEFAULTWORKINGNIC2="$(netstat -nr -f inet6|grep default|awk '{print $4}' |head -n1)"; }; [[ -n "$DEFAULTWORKINGNIC2" ]] && DEFAULTWORKINGIPARR1=`ifconfig ''${DEFAULTWORKINGNIC2}'' |grep -Fv inet6|grep inet|awk '{print $2}'`; DEFAULTWORKINGGATEARR1=`netstat -nr -f inet|grep default|grep ''${DEFAULTWORKINGNIC2}'' |awk '{print $2}'`; [[ -n "$DEFAULTWORKINGNIC2" ]] && DEFAULTWORKINGIPARR2=`ifconfig ''${DEFAULTWORKINGNIC2}'' |grep inet6|head -n1|awk '{print $2}'|sed 's/%.*//g'`; DEFAULTWORKINGGATEARR2=`netstat -nr -f inet6|grep default|grep ''${DEFAULTWORKINGNIC2}'' |awk '{ print $2}'|sed 's/%.*//g'`; [[ `echo $DEFAULTWORKINGIPARR1|grep -Eo ":"` && `echo $DEFAULTWORKINGIPARR1|grep -Eo ":"` && `echo $DEFAULTWORKINGIPARR2|grep -Eo ":"` && `echo $DEFAULTWORKINGIPARR2|grep -Eo ":"` ]] && echo "IPV6 only detected,will force FORCENETCFGV6ONLY to 1" && FORCENETCFGV6ONLY=1; };

while [[ $# -ge 1 ]]; do
  case $1 in
    -n|--forcenetcfgstr)
      shift
      FORCENETCFGSTR="$1"
      [[ -n "$FORCENETCFGSTR" ]] && [[ $tmpTARGETMODE != 1 && $forcemaintainmode != 1 ]] && [[ `echo "$FORCENETCFGSTR" | grep -Eo ":"` != '' ]] && { FORCENETCFGV6ONLY=1 && echo "Netcfgstr forced to some v6 value,will force setnet mode"; } || { echo "Netcfgstr forced to some v4 value,will force setnet mode"; }
      shift
      ;;
    -6|--forcenetcfgv6only)
      shift
      FORCENETCFGV6ONLY="$1"
      [[ -n "$FORCENETCFGV6ONLY" ]] && [[ $tmpTARGETMODE != 1 && $forcemaintainmode != 1 ]] && echo "FORCENETCFGV6ONLY forced to some value,will force IPV6ONLY stack probing mode"
      shift
      ;;
    -i|--force1stnicname)
      shift
      FORCE1STNICNAME="$1"
      [[ -n "$FORCE1STNICNAME" ]] && [[ $tmpTARGETMODE != 1 && $forcemaintainmode != 1 ]] && echo "1stnicname forced to some value,will force 1stnic name"
      shift
      ;;
    -m|--forcemirror)
      shift
      FORCEDEBMIRROR="$1"
      [[ "$FORCEDEBMIRROR" == 'github' ]] && FORCEDEBMIRROR=$autoDEBMIRROR0;[[ "$FORCEDEBMIRROR" == 'gitlab' ]] && FORCEDEBMIRROR=$autoDEBMIRROR1
      [[ -n "$FORCEDEBMIRROR" ]] && [[ $tmpTARGETMODE != 1 && $forcemaintainmode != 1 ]] && echo "Mirror forced to some value,will override autoselectdebmirror results"
      shift
      ;;
    -p|--force1sthdname)
      shift
      FORCE1STHDNAME="$1"
      [[ "$tmpTARGET" == 'devdeskde' ]] && echo "cant set -p when target is devdeskde" && exit 1;
      [[ -n "$FORCE1STHDNAME" ]] && [[ $tmpTARGETMODE != 1 && $forcemaintainmode != 1 ]] && echo "1sthdname forced to some value,will force 1sthd name"
      shift
      ;;
    -w|--forcepassword)
      shift
      FORCEPASSWORD="$1"
      [[ -n "$FORCEPASSWORD" ]] && [[ $tmpTARGETMODE != 1 && $forcemaintainmode != 1 ]] && echo "password forced to some value,will force oripass or curpass"
      shift
      ;;
    -o|--forceinstctl)
      shift
      FORCEINSTCTL="$1"
      [[ -n "$FORCEINSTCTL" ]] && [[ $tmpTARGETMODE != 1 && $forcemaintainmode != 1 ]] && echo "instctl forced to some value,will force instctl (and post process)"
      shift
      ;;
    --cmd)
      shift
      FORCEINSTCMD="$1"
      [[ -n "$FORCEINSTCMD" ]] && [[ $tmpTARGETMODE != 1 && $forcemaintainmode != 1 ]] && echo "instcmd forced to some value,will force instctl (assum cmdstr were single quoted)"
      shift
      ;;
    -b|--build)
      shift
      tmpBUILD="$1"
      shift
      ;;
    -s|--serial)
      shift
      tmpINSTSERIAL="$1"
      [[ "$tmpINSTSERIAL" == '1' ]] && [[ $tmpTARGETMODE != 1 && $forcemaintainmode != 1 ]] && echo "Serial forced,will process serial console after booting"
      shift
      ;;
    -g|--gene)
      shift
      tmpBUILDGENE="$1"
      [[ "$tmpBUILDGENE" == '0' && "$tmpBUILDGENE" != '' ]] && [[ $tmpTARGETMODE == 0 || $tmpTARGETMODE == 1 && $forcemaintainmode != 1 ]] && echo "biosmbr only given,will process biosmbr bootinglogic and disk supports for buildmode or force it in installmode"
      [[ "$tmpBUILDGENE" == '1' && "$tmpBUILDGENE" != '' ]] && [[ $tmpTARGETMODE == 0 || $tmpTARGETMODE == 1 && $forcemaintainmode != 1 ]] && echo "biosgpt only given,will process biosgpt bootinglogic and disk supports for buildmode or force it in installmode"
      [[ "$tmpBUILDGENE" == '2' && "$tmpBUILDGENE" != '' ]] && [[ $tmpTARGETMODE == 0 || $tmpTARGETMODE == 1 && $forcemaintainmode != 1 ]] && echo "uefigpt only given,will process uefigpt bootinglogic and disk supports for buildmode or force it in installmode"
      [[ "$tmpBUILDGENE" == '0,1,2' && "$tmpBUILDGENE" != '' ]] && tmpTARGETMODE='1' && echo "all gens given,will process all bootinglogic and disk supports for buildmode"
      shift
      ;;
    -a|--arch)
      shift
      tmpHOSTARCH="$1"
      [[ "$tmpHOSTARCH" == '0' && "$tmpHOSTARCH" != '' ]] && [[ $tmpTARGETMODE == 0 || $tmpTARGETMODE == 1 && $forcemaintainmode != 1 ]] && echo "Amd64 only given,will process amd64 addon supports for buildmode or force arm in installmode"
      [[ "$tmpHOSTARCH" == '1' && "$tmpHOSTARCH" != '' ]] && [[ $tmpTARGETMODE == 0 || $tmpTARGETMODE == 1 && $forcemaintainmode != 1 ]] && echo "Arm64 only given,will process arm64 addon supports for buildmode or force arm in installmode"
      [[ "$tmpHOSTARCH" == '0,1' && "$tmpHOSTARCH" != '' ]] && tmpTARGETMODE='1' && echo "all archs given,will process all addon supports for buildmode"
      shift
      ;;
    -v|--virt)
      shift
      tmpCTVIRTTECH="$1"
      [[ "$tmpCTVIRTTECH" == '1' && $tmpTARGETMODE == 4 && $forcemaintainmode != 1 ]] && echo "ct lxc tech given,will force lxc in inplacedd installmode"
      [[ "$tmpCTVIRTTECH" == '2' && $tmpTARGETMODE == 4 && $forcemaintainmode != 1 ]] && echo "ct kvm tech given,will force kvm in inplacedd installmode"
      shift
      ;;

    -t|--target)
      shift
      tmpTARGET="$1"
      case $tmpTARGET in
        '') echo "Target not given,will exit" && exit 1 ;;
        dummy) echo "dummy given,will try debugmode" && tmpTARGETMODE='0' && tmpINSTWITHMANUAL='1' ;;
        debianbase) tmpTARGETMODE='1' ;;
        onekeydevdesk*) tmpTARGETMODE='1' && tmpTARGET='onekeydevdesk'
        [[ "$1" =~ 'onekeydevdesk,' ]] && {
          for tgt in `[[ "$tmpBUILD" -ne '0' ]] && echo "${1##onekeydevdesk}" |sed 's/,/\n/g' || echo "${1##onekeydevdesk}" |sed 's/,/\'$'\n''/g'`
          do
          [[ $tgt =~ "++" ]] && { PACKCONTAINERS+=",""${tgt##++}";GENCONTAINERS+=",""${tgt##++}"; } || { [[ $tgt =~ "+" ]] && { GENCONTAINERS+=",""${tgt##+}"; } || { PACKCONTAINERS+=",""${tgt}"; }; }
          done
          echo -n "onekeydevdesk Fullgen mode detected,with pack addons:""$PACKCONTAINERS" |sed 's/,/ /g' && echo " and migrate addons:""$GENCONTAINERS" |sed 's/,/ /g'
        } ;;
        deb) tmpTARGET='debian' && tmpTARGETMODE='0' && [[ $tmpTARGETMODE != 1 && $forcemaintainmode != 1 ]] && echo "deb given,will force nativedi instmode and debian target(currently 11)" ;;
        debian) tmpTARGETMODE='0' && [[ $tmpTARGETMODE != 1 && $forcemaintainmode != 1 ]] && echo "debian given,will force nativedi instmode and debian target(currently 11)" ;;
        debian10r) tmpTARGETMODE='0' ;;
        devdesk*) 
        [[ "$tmpTARGET" == 'devdesk' ]] && { tmpTARGETMODE='10' && echo "devdesk given,will force install pve only(without app)"; } || {
        echo -e "\033[31mother devdesk variable target was temply deprecated, for now, you can use -t appname or -t devdesk instead to install a embeded devdesk!\033[0m" && exit 1
        [[ "$tmpTARGET" == 'devdeskct' ]] && { tmpTARGETMODE='4' && echo "devdeskct given,will force inplace instmode and devdeskos ct images(based on virttech)"; }
        [[ "$tmpTARGET" == 'devdeskde' ]] && { [[ "$FORCE1STHDNAME" != '' ]] && echo "cant set -p when target is devdeskde" && exit 1;tmpTARGETMODE='4' && FORCE1STHDNAME='localfile' && echo "devdeskde given,will force inplace instmode and localfile -p"; }
        [[ "$tmpTARGET" != 'devdeskct' && "$tmpTARGET" != 'devdeskde' ]] && { [[ ! ("$tmpTARGET" =~ 'devdeskos') ]] && tmpTARGET=${1/devdesk/devdeskos}

          [[ "$tmpTARGET" == 'devdeskos' ]] && tmpTARGETMODE='0' && [[ $tmpTARGETMODE != 1 && $forcemaintainmode != 1 ]] && echo "Devdeskos Wgetdd instonly mode detected"
        }; } ;;

        /*) [[ "$autoDEBMIRROR0" =~ "/inst/raw/master" ]] || { IMGMIRROR0=${autoDEBMIRROR0}"/.." && tmpTARGET0=$tmpTARGET && tmpTARGET=`echo "$tmpTARGET0" |sed "s#^#$IMGMIRROR0#g"`; }; tmpTARGETMODE='0' ;;
        *) echo "$tmpTARGET" |grep -q '^http://\|^ftp://\|^https://\|^10000:/dev/\|^/dev/\|^./';[[ $? -ne '0' ]] && echo "app name given, will force appinst mode" && tmpTARGETMODE=10 || { 
          echo "$tmpTARGET" |grep -q '^http://\|^ftp://\|^https://';[[ $? -eq '0' ]] && [[ $tmpTARGETMODE != 1 && $forcemaintainmode != 1 ]] && echo "(trans) Raw urls detected,will override autotargetddurl results and force wgetdd instmode" && tmpTARGETMODE=0;
          echo "$tmpTARGET" |grep -q '^10000:/dev/';[[ $? -eq '0' ]] && echo "Port:blkdevname detected,will force nchttpsrv resmode" && tmpTARGETMODE=2;
          echo "$tmpTARGET" |grep -q '^http://.*:10000';[[ $? -eq '0' ]] && echo "Http:Port detected,will force nctarget+instmode" && tmpTARGETMODE=0; 
          echo "$tmpTARGET" |grep -q '^./.*';[[ $? -eq '0' ]] && echo "local target img detected,will force localmode" && tmpTARGETMODE=5; } ;;
      esac
      shift
      ;;
    -d|--debug)
      shift
      tmpDEBUG="$1"
      [[ "$tmpTARGET" == '' ]]  && tmpTARGET='dummy' && [[ $tmpTARGETMODE != 1 && $forcemaintainmode != 1 ]] && echo "no target given, will force target as dummy"
      [[ ("$tmpDEBUG" == '1' || "$tmpDEBUG" == '' || "$tmpDEBUG" =~ 'vnc:' || "$tmpDEBUG" =~ '22:' ) && "$tmpTARGETMODE" != '1' ]] && {
        [[ "$tmpDEBUG" == '1' || "$tmpDEBUG" == '' ]] && tmpINSTWITHMANUAL='1' && [[ $tmpTARGETMODE != 1 && $forcemaintainmode != 1 ]] && echo "Manual modes enabled in instmode,will force target as its, and force reboot if lost in 5 mins in trying ssh";
        [[ "$tmpDEBUG" =~ 'vnc:' ]] && tmpINSTVNCPORT=`echo ${tmpDEBUG##vnc:}` && echo "force custom vnc port";
        [[ "$tmpDEBUG" =~ '22:' ]] && tmpINSTWITHBORE=`echo ${tmpDEBUG##22:}` && tmpINSTWITHMANUAL='1' && [[ $tmpTARGETMODE != 1 && $forcemaintainmode != 1 ]] && echo "Manual modes enabled in instmode,will force target as its, and force reboot if lost in 5 mins in trying ssh, and enable bore";
      }
      [[ ("$tmpDEBUG" == '1' || "$tmpDEBUG" == '') && "$tmpTARGETMODE" == '1' ]] && tmpBUILDINSTTEST='1' && tmpINSTWITHMANUAL='1' && echo "Debug supports enabled in buildmode,will keep target as its, and force hold before reboot and localinstant boot test"
      [[ ("$tmpDEBUG" == '2' && "$tmpDEBUG" != '') && "$tmpTARGETMODE" != '1' ]] && echo -n "3rd rescue env given" && { [[ $(mount) =~ ^/dev/(sd|vd|nvme|xvd) ]] || [[ $(ls /boot 2>/dev/null) =~ grub ]] || [[ "$tmpBUILD" == '1' || "$tmpBUILD" == '11' ]] && echo ",but no rescue env detected,still forced"; }
      [[ ("$tmpBUILDADDONS" == '1' || "$tmpBUILDADDONS" == '') && "$tmpDEBUG" == '1' ]] && echo "debug and ci cant coexsits" && exit 1
      shift
      ;;
    -c|--ci)
      shift
      tmpBUILDADDONS="$1"
      [[ ("$tmpBUILDADDONS" == '1' || "$tmpBUILDADDONS" == '') && "$tmpTARGETMODE" == '1' ]] && echo "ci forced in buildmode,will force ci actions"
      [[ ("$tmpBUILDADDONS" == '1' || "$tmpBUILDADDONS" == '') && "$tmpDEBUG" == '1' ]] && echo "debug and ci cant coexsits" && exit 1
      shift
      ;;
    -h|--help|*)
      if [[ "$1" != 'error' ]]; then echo -ne "\nInvaild option: '$1'\n\n"; fi
      echo -ne "Usage(args are self explained):\n\t-m/--forcemirror\n\t-n/--forcenetcfgstr\n\t-b/--build\n\t-t/--target\n\t-s/--serial\n\t-g/--gene\n\t-a/--arch\n\t-d/--debug\n\n"
      exit 1;
      ;;
    esac
  done

[[ $tmpTARGETMODE != 1 && $forcemaintainmode == 1 ]] && { echo -e "\033[31m\n维护,脚本无限期闭源或开放，请联系作者\nThe script was invalid in maintaince mode with a undetermined closed/reopen date,please contact the author\n \033[0m"; exit 1; }

printf "\n ✔ %-30s" "Checking deps ......"
if [[ "$tmpTARGET" == 'debianbase' && "$tmpTARGETMODE" == '1' ]]; then
  CheckDependence sudo,wget,ar,awk,grep,sed,cut,cat,cpio,curl,gzip,find,dirname,basename,xzcat,zcat,md5sum,sha1sum,sha256sum,grub-reboot;
elif [[ ( "$tmpTARGET" == 'debianct' || "$tmpTARGET" == 'devdeskct' ) && "$tmpTARGETMODE" == '4' && "$tmpBUILD" != '1' ]] ; then
  CheckDependence sudo,wget,ar,awk,grep,sed,cut,cat,cpio,curl,gzip,find,dirname,basename,xzcat,zcat,rsync,virt-what;
elif [[ "$tmpTARGET" == 'devdeskde' && "$tmpTARGETMODE" == '4' && "$tmpBUILD" != '1' ]] ; then
  CheckDependence sudo,wget,ar,awk,grep,sed,cut,cat,cpio,curl,gzip,find,dirname,basename,fdisk,xzcat,zcat;
elif [[ "$tmpTARGET" != '' && "$tmpTARGETMODE" == '10' ]]; then
  CheckDependence sudo,wget,ar,awk,grep,sed,cut,cat,cpio,curl,gzip,find,dirname,basename,fdisk,xzcat,zcat,qemu-img;
else
  CheckDependence sudo,wget,ar,awk,grep,sed,cut,cat,cpio,curl,gzip,find,dirname,basename,fdisk,xzcat,zcat,df,openssl;
fi

[[ "$tmpTARGETMODE" == '4' && "$tmpTARGET" != 'devdeskde' ]] && printf "\n ✔ %-30s" "Checking virttech ......"
[[ "$tmpTARGETMODE" == '4' && "$tmpTARGET" != 'devdeskde' ]] && {
  [[ "$tmpCTVIRTTECH" == '1' ]] && echo -en "[ \033[32m force,lxc \033[0m ]";
  [[ "$tmpCTVIRTTECH" == '2' ]] && echo -en "[ \033[32m force,kvm \033[0m ]";
  [[ "$tmpCTVIRTTECH" != '1' && ( "$(virt-what|head -n1)" == "lxc" || "$(virt-what|head -n1)" == "openvz" ) ]] && tmpCTVIRTTECH='1' && echo -en "[ \033[32m auto,lxc \033[0m ]";
  [[ "$tmpCTVIRTTECH" != '2' && "$(virt-what|head -n1)" == "kvm" ]] && tmpCTVIRTTECH='2' && echo -en "[ \033[32m auto,kvm \033[0m ]";
  [[ "$tmpCTVIRTTECH" == '0' ]] && [[ "$tmpCTVIRTTECH" != '1' && "$tmpCTVIRTTECH" != '2' ]] && echo "fail,no virttech detected,will exit" && exit 1;
}

[[ "$tmpTARGETMODE" == '10' && "$tmpTARGET" != '' ]] && {
  printf "\n ✔ %-30s" "Checking pveinst ......"
  if command -v pveversion >/dev/null 2>&1 && ! pveversion >/dev/null 2>&1| grep -Eq "pve-manager/7.[1-9]"; then { tmpPVEREADY='1' && echo -en "[ \033[32m ready \033[0m ]"; }; else echo -en "[ \033[32m n/a, to install \033[0m ]"; fi
}

printf "\n ✔ %-30s" "Selecting Mirror/Targets ..." 

if [[ "$tmpTARGETMODE" == '0' || "$tmpTARGETMODE" == '4' ]]; then
  AUTODEBMIRROR=`echo -e $(SelectDEBMirror $autoDEBMIRROR0 $autoDEBMIRROR1)|sort -n -k 2 | head -n2 | grep http | sed  -e 's#[[:space:]].*##'`
  [[ -n "$AUTODEBMIRROR" && -z "$FORCEDEBMIRROR" ]] && DEBMIRROR=$AUTODEBMIRROR && echo -en "[ \033[32m auto,${DEBMIRROR} \033[0m ]"  # || exit 1
  [[ -n "$AUTODEBMIRROR" && -n "$FORCEDEBMIRROR" ]] && DEBMIRROR=$FORCEDEBMIRROR && echo -en "[ \033[32m force,${DEBMIRROR} \033[0m ]"  # || exit 1
  [[ -z "$AUTODEBMIRROR" && -n "$FORCEDEBMIRROR" ]] && DEBMIRROR=$FORCEDEBMIRROR && echo -en "[ \033[32m force,${DEBMIRROR} \033[0m ]"  # || exit 1
  [[ -z "$AUTODEBMIRROR" && -z "$FORCEDEBMIRROR" ]] && DEBMIRROR=$autoDEBMIRROR1 && echo -en "[ \033[32m failover,${DEBMIRROR} \033[0m ]"  # || exit 1
else

  DEBMIRROR=$autoDEBMIRROR0 && echo -en "[ \033[32m force,${DEBMIRROR} \033[0m ]"
fi

case $tmpTARGET in

  '') echo "Target not given,will exit" && exit 1 ;;  
  dummy) TARGETDDURL='' ;;
  deb|debian) TARGETDDURL='http://deb.debian.org' ;; # ${IMGMIRROR/xxxxxx/1keydddebianbase-mirror} ;;
  devdeskos*) [[ "$DEBMIRROR" =~ "/raw/master" ]] && { ifgap="${DEBMIRROR#*inst}";ifgap="${ifgap%raw\/master*}";ifgap="${ifgap//\//}";[[ -z "$ifgap" ]] && IMGMIRROR=${DEBMIRROR/\/inst\/raw\/master/}"/xxxxxx/raw/master" || IMGMIRROR=${DEBMIRROR/\/inst\/$ifgap\/raw\/master/}"/xxxxxx/$ifgap/raw/master"; } || IMGMIRROR=${DEBMIRROR/\/inst/}"/xxxxxx";TARGETDDURL=${IMGMIRROR/xxxxxx/1kdd}"/_build/devdeskos/binary$([ "$tmpHOSTARCH" == '1' -a "$tmpHOSTARCH" != '' ]  && echo -n -arm64 || echo -n -amd64)/tarball"
    CheckTargeturl $TARGETDDURL"/onekeydevdeskd-01core$([ "$tmpHOSTARCH" == '1' -a "$tmpHOSTARCH" != '' ]  && echo _arm64).xz_000.chunk" ;;
  debian10r) TARGETDDURL=${IMGMIRROR/xxxxxx/1keyddhubfree-$tmpTARGET}"/"$tmpTARGET"estore/binary$([ "$tmpHOSTARCH" == '1' -a "$tmpHOSTARCH" != '' ]  && echo -arm64 || echo -amd64)/"$tmpTARGET"estore$([ "$tmpHOSTARCH" == '1' -a "$tmpHOSTARCH" != '' ]  && echo _arm64).xz"
    [[ "$tmpTARGETMODE" == '0' ]] && CheckTargeturl $TARGETDDURL"_000" ;;
  debianct) TARGETDDURL=${IMGMIRROR/xxxxxx/1keyddhubfree-debtpl}/"$([ "$tmpCTVIRTTECH" == '1' -a "$tmpCTVIRTTECH" != '' ]  && echo lxcdebtpl || echo qemudebtpl)"/binary"$([ "$tmpHOSTARCH" == '1' -a "$tmpHOSTARCH" != '' ]  && echo -arm64 || echo -amd64)"/tarball/"$([ "$tmpCTVIRTTECH" == '1' -a "$tmpCTVIRTTECH" != '' ]  && echo lxcdebtpl || echo qemudebtpl)""$([ "$tmpHOSTARCH" == '1' -a "$tmpHOSTARCH" != '' ]  && echo _arm64).tar.xz"
    [[ "$tmpTARGETMODE" == '4' ]] && CheckTargeturl $TARGETDDURL"_000" ;;
  devdeskct|devdeskde) [[ "$DEBMIRROR" =~ "/raw/master" ]] && { ifgap="${DEBMIRROR#*inst}";ifgap="${ifgap%raw\/master*}";ifgap="${ifgap//\//}";[[ -z "$ifgap" ]] && IMGMIRROR=${DEBMIRROR/\/inst\/raw\/master/}"/xxxxxx/raw/master" || IMGMIRROR=${DEBMIRROR/\/inst\/$ifgap\/raw\/master/}"/xxxxxx/$ifgap/raw/master"; } || IMGMIRROR=${DEBMIRROR/\/inst/}"/xxxxxx";TARGETDDURL=${IMGMIRROR/xxxxxx/1kdd}"/_build/devdeskos/binary$([ "$tmpHOSTARCH" == '1' -a "$tmpHOSTARCH" != '' ]  && echo -n -arm64 || echo -n -amd64)/tarball"
    [[ "$tmpTARGETMODE" == '4' ]] && CheckTargeturl $TARGETDDURL"/clientcore$([ "$tmpHOSTARCH" == '1' -a "$tmpHOSTARCH" != '' ]  && echo _arm64).xz_000" ;;
  /*|./*|*) [[ "$tmpTARGETMODE" == '5' ]] && { ABSOLUTE_PATH=$(readlink -f "$tmpTARGET");DIR_NAME=$(dirname "$ABSOLUTE_PATH");MOUNT_POINT=$(df "$tmpTARGET" | grep -v Filesystem | awk '{print $6}');TARGETDDURL=${DIR_NAME#$MOUNT_POINT};UNZIP="$([[ ${tmpTARGET##*.} == 'gz' ]] && echo 1;[[ ${tmpTARGET##*.} == 'xz' ]] && echo 2)"; }

    [[ "$tmpTARGETMODE" != '1' && "$tmpTARGETMODE" != '2' && "$tmpTARGETMODE" != '5' ]] && TARGETDDURL=$tmpTARGET && CheckTargeturl $TARGETDDURL ;;
esac

sleep 2

umount --force $remasteringdir/initramfs/{dev/pts,dev,proc,sys} $remasteringdir/initramfs_arm64/{dev/pts,dev,proc,sys} >/dev/null 2>&1
umount --force $remasteringdir/onekeydevdeskd/01-core/{dev/pts,dev,proc,sys} $remasteringdir/onekeydevdeskd_arm64/01-core/{dev/pts,dev,proc,sys} >/dev/null 2>&1

[[ -d $remasteringdir ]] && rm -rf $remasteringdir;

mkdir -p $remasteringdir/initramfs/files/usr/bin $remasteringdir/initramfs_arm64/files/usr/bin $remasteringdir/onekeydevdeskd/01-core $remasteringdir/onekeydevdeskd_arm64/01-core $remasteringdir/x
mkdir -p $remasteringdir/epve $remasteringdir/epve_arm64

[[ "$tmpTARGET" != 'debianbase' && "$tmpTARGETMODE" != '10' ]] && parsenetcfg
[[ "$tmpTARGET" != 'debianbase' && "$tmpTARGETMODE" != '10' ]] && parsediskcfg
trap 'echo; echo "- aborting by user, restore dns"; restoreall dnsonly;exit 1' SIGINT

[[ "$tmpTARGETMODE" != '10' ]] && preparepreseed
[[ "$tmpTARGETMODE" != '4' && "$tmpTARGETMODE" != '10' ]] && patchpreseed

[[ "$tmpTARGETMODE" != '1' ]] && [[ -d $downdir ]] && rm -rf $downdir;
mkdir -p $downdir/debianbase $downdir/debianbase/dists/bullseye/main/binary-amd64/deb $downdir/debianbase/dists/bullseye/main/binary-arm64/deb $downdir/debianbase/dists/bullseye/main-debian-installer/binary-amd64/udeb $downdir/debianbase/dists/bullseye/main-debian-installer/binary-arm64/udeb $downdir/debianbase/dists-addons/{docker,pve7extras,pve7extras_arm64,lxc,qemu,qemuarm-fix,zfs-utils}

[[ ( "$tmpTARGETMODE" != '1' && "$tmpTARGETMODE" != '5' ) || "$tmpTARGETMODE" == '4' ]] || [[ "$tmpTARGETMODE" == '10' && "$tmpTARGET" != '' && "$tmpPVEREADY" != '1' ]] && getbasics down

[[ "$tmpTARGETMODE" == '1' ]] && { [[ -d $topdir/../1keydddebianbase-mirror ]] && getbasics copy || getbasics down; }
[[ "$tmpTARGETMODE" != '10' ]] || [[ "$tmpTARGETMODE" == '10' && "$tmpTARGET" != '' && "$tmpPVEREADY" != '1' ]] && processbasics
[[ "$tmpTARGETMODE" == '10' && "$tmpTARGET" != '' && "$tmpPVEREADY" != '1' ]] && {

  sleep 2 && printf "\n ✔ %-30s" "Busy installing epveall ......"

  install_lxc
  install_pve

  tar -xJf $downdir/debianbase/epvecore.xz -C / --no-overwrite-dir --keep-directory-symlink pve7 --strip-components=1
  tar -xJf $downdir/debianbase/epvecore.xz -C /usr/share/perl5 PVE Proxmox
  tar -xJf $downdir/debianbase/epvecore.xz -C /usr/share pve-manager
  tar -xJf $downdir/debianbase/epvecore.xz -C /usr/share/javascript proxmox-widget-toolkit

  update-alternatives --set iptables /usr/sbin/iptables-legacy >/dev/null 2>&1

  mv /usr/share/apparmor-features/features /usr/share/apparmor-features/features2
  mv /usr/share/apparmor-features/features.stock /usr/share/apparmor-features/features
  mv /usr/share/apparmor-features/features2 /usr/share/apparmor-features/features.stock

  [[ -z "$tmpTGTNICIP" ]] && echo "nicip not given,will exit" && exit

  sed -i "s/127.0.1.1/$tmpTGTNICIP/g" /etc/hosts

  MAINNIC="$(ip route show |grep -o 'default via [0-9]\{1,3\}.[0-9]\{1,3\}.[0-9]\{1,3\}.[0-9]\{1,3\}.*' |head -n1 |sed 's/proto.*\|onlink.*//g' |awk '{print $NF}')"
  cp /etc/network/interfaces /etc/network/interfaces.bak 
  > /etc/network/interfaces
  tee -a /etc/network/interfaces > /dev/null <<EOF
source /etc/network/interfaces.d/*
auto lo $MAINNIC
iface lo inet loopback
allow-hotplug $MAINNIC
iface $MAINNIC inet manual

auto vmbr0
iface vmbr0 inet dhcp
    bridge-ports $MAINNIC
    bridge-stp off
    bridge-fd 0
    post-up ip link set dev vmbr0 mtu 1500

auto vmbr1
iface vmbr1 inet static
    address 10.10.10.254
    netmask 255.255.255.0
    bridge-ports none
    bridge-stp off
    bridge-fd 0
    post-up   echo 1 > /proc/sys/net/ipv4/ip_forward
    post-up   iptables -t nat -A POSTROUTING -s '10.10.10.0/24' -o vmbr0 -j MASQUERADE
    post-down iptables -t nat -D POSTROUTING -s '10.10.10.0/24' -o vmbr0 -j MASQUERADE
    post-up   bash /usr/bin/pvesetnatrefresh
EOF
  tee -a /usr/bin/pvesetnatrefresh > /dev/null <<EOF
iptables -t nat -D PREROUTING -j CUSTOM_RULES >/dev/null 2>&1;iptables -t nat -F CUSTOM_RULES >/dev/null 2>&1;iptables -t nat -X CUSTOM_RULES >/dev/null 2>&1
iptables -t nat -N CUSTOM_RULES >/dev/null 2>&1;[[ \$? == '0' ]] && { iptables -t nat -A PREROUTING -j CUSTOM_RULES;bash /root/.pvesetnatrc; }
EOF
  chmod +x /usr/bin/pvesetnatrefresh
  tee -a /root/.pvesetnatrc > /dev/null <<EOF

EOF
  chmod +x /root/.pvesetnatrc
  /etc/init.d/networking restart
  /etc/init.d/isc-dhcp-server start

  mkdir -p /var/lib/rrdcached/db
  update-rc.d -f lxc remove >/dev/null 2>&1;update-rc.d lxc defaults >/dev/null 2>&1
  /etc/init.d/lxc start
  update-rc.d -f pvedaemon remove >/dev/null 2>&1;update-rc.d pvedaemon defaults >/dev/null 2>&1
  /etc/init.d/pvedaemon start
  cp $downdir/debianbase/lxcdebtpl.tar.xz /var/lib/vz/template/cache

  tmpPVEREADY='1'

  echo -en "[ \033[32m done. \033[0m ]"
}

mkdir -p $remasteringdir/boot # $remasteringdir/boot/grub/i386-pc $remasteringdir/boot/EFI/boot/x86_64-efi

[[ "$tmpDRYRUNREMASTER" == '0' ]] && [[ "$tmpTARGETMODE" == '0' || "$tmpTARGETMODE" == '1' || "$tmpTARGETMODE" == '2' || "$tmpTARGETMODE" == '4' || "$tmpTARGETMODE" == '5' ]] && {

  sleep 2 && printf "\n ✔ %-30s" "Busy Remastering/mutating .."

  [[ "$tmpTARGETMODE" != '0' && "$tmpTARGETMODE" != '4'  ]] && cp -f $remasteringdir/initramfs/preseed.cfg $remasteringdir/initramfs/files/preseed.cfg
  [[ "$tmpTARGETMODE" != '0' && "$tmpTARGETMODE" != '4'  ]] && cp -f $remasteringdir/initramfs_arm64/preseed.cfg $remasteringdir/initramfs_arm64/files/preseed.cfg

  if [[ "$tmpTARGETMODE" == '0' || "$tmpTARGETMODE" == '2' || "$tmpTARGETMODE" == '5' ]]; then

    processgrub
    patchgrub

  fi


  [[ "$tmpTARGETMODE" == '4' && "$tmpTARGET" != 'devdeskde' ]] && inplacemutating
  [[ "$tmpTARGETMODE" == '4' && "$tmpTARGET" == 'devdeskde' ]] && ddtoafile

  echo -en "[ \033[32m done. \033[0m ]"

}

[[ "$tmpDRYRUNREMASTER" == '0' ]] && [[ "$tmpTARGETMODE" == '10' && "$tmpTARGET" != '' && "$tmpTARGET" != 'devdesk' && "$tmpPVEREADY" == '1' ]] && {
  sleep 2 && printf "\n ✔ %-30s" "Busy installing app ......"

  APP=$tmpTARGET
  DEF_PORT=""
  var_disk="8"
  var_cpu="1"
  var_ram="1024"
  var_os="debian"
  var_version="11"

  NSAPP=$(echo ${APP,,} | tr -d ' ') # This function sets the NSAPP variable by converting the value of the APP variable to lowercase and removing any spaces.
  REPO=${DEBMIRROR}/_build/appp
  
  url_check "${REPO}/${APP}/${APP}_install.sh"

  NEXTID=$(pvesh get /cluster/nextid)
  timezone=$(cat /etc/timezone)

  CT_TYPE="1"
  PW=""
  CT_ID=$NEXTID
  HN=$NSAPP
  DISK_SIZE="$var_disk"
  CORE_COUNT="$var_cpu"
  RAM_SIZE="$var_ram"
  BRG="vmbr1"
  NET="dhcp"
  GATE=""
  APT_CACHER=""
  APT_CACHER_IP=""
  DISABLEIP6="no"
  MTU=""
  SD=""
  NS=""
  MAC=""
  VLAN=""
  SSH="no"
  VERB="no"

  echo
  echo -e "${DGN}Using Template: ${BGN}$var_os $var_version${CL}"
  echo -e "${DGN}Using Container Type: ${BGN}$CT_TYPE${CL}"
  echo -e "${DGN}Using Root Password: ${BGN}Automatic Login${CL}"
  echo -e "${DGN}Using Container ID: ${BGN}$NEXTID${CL}"
  echo -e "${DGN}Using Hostname: ${BGN}$NSAPP${CL}"
  echo -e "${DGN}Using Disk Size: ${BGN}$var_disk${CL}${DGN}GB${CL}"
  echo -e "${DGN}Allocated Cores ${BGN}$var_cpu${CL}"
  echo -e "${DGN}Allocated Ram ${BGN}$var_ram${CL}"
  echo -e "${DGN}Using Bridge: ${BGN}vmbr1${CL}"
  echo -e "${DGN}Using Static IP Address: ${BGN}dhcp${CL}"
  echo -e "${DGN}Using Gateway IP Address: ${BGN}Default${CL}"
  echo -e "${DGN}Using Apt-Cacher IP Address: ${BGN}Default${CL}"
  echo -e "${DGN}Disable IPv6: ${BGN}No${CL}"
  echo -e "${DGN}Using Interface MTU Size: ${BGN}Default${CL}"
  echo -e "${DGN}Using DNS Search Domain: ${BGN}Host${CL}"
  echo -e "${DGN}Using DNS Server Address: ${BGN}Host${CL}"
  echo -e "${DGN}Using MAC Address: ${BGN}Default${CL}"
  echo -e "${DGN}Using VLAN Tag: ${BGN}Default${CL}"
  echo -e "${DGN}Enable Root SSH Access: ${BGN}No${CL}"
  echo -e "${DGN}Enable Verbose Mode: ${BGN}No${CL}"
  echo -e "${BL}Creating a ${APP} LXC using the above default settings${CL}"

  while read line; do

    if [[ "$line" =~ "unprivileged:" ]]; then echo CT_TYPE=$(echo "$line" | tr -d ' ' | sed 's/.*unprivileged://g');CT_TYPE=$(echo "$line" | tr -d ' ' | sed 's/.*unprivileged://g'); fi
    if [[ "$line" =~ "defport:" ]]; then echo DEF_PORT=$(echo "$line" | tr -d ' ' | sed 's/.*defport://g');DEF_PORT=$(echo "$line" | tr -d ' ' | sed 's/.*defport://g'); fi
  done < <(cfg_check "${REPO}/${APP}/${APP}.conf")

  build_container
  buildinstfuncs

  [[ ! -z "$CTID" ]] && {

    msg_info "Starting LXC Container"
    pct start "$CTID"
    msg_ok "Started LXC Container"

    lxc-attach -n "$CTID" -- bash -c "$setting_up_container" || exit
    lxc-attach -n "$CTID" -- bash -c "$network_check" || exit
    lxc-attach -n "$CTID" -- bash -c "$(wget -qLO - ${REPO}/${APP}/${APP}_install.sh)" -- "${REPO}" || exit
    lxc-attach -n "$CTID" -- bash -c "$motd_ssh" || exit
    lxc-attach -n "$CTID" -- bash -c "$customize" || exit

  }

  IP=$(pct exec "$CTID" ip a s dev eth0 | awk '/inet / {print $2}' | cut -d/ -f1)
  pct set "$CTID" -description "Thanks for Proxmox VE Helper Scripts"

  msg_ok "Completed Successfully!\n"
  echo -e "${APP} should be reachable by going to the following URL.
         ${BL}http://${IP}:${DEF_PORT}${CL} \n"

  iptablesconf='/root/.pvesetnatrc'
  [[ ! -f "$iptablesconf" ]] && {
    tee -a "$iptablesconf" > /dev/null <<EOF
EOF
    chmod +x "$iptablesconf"
  }

  read -r -p "Enable Outbound port? <y/N> " prompt </dev/tty
  if [[ "${prompt,,}" =~ ^(y|yes)$ ]]; then
    if [ ! -z "$DEF_PORT" ]; then applynat add ${IP} ${DEF_PORT}; else applynat add ${IP}; fi
  else
    exit
  fi

}

cd $topdir/$targetdir # && CWD="$(pwd)" && echo -en "[ \033[32m cd to ${CWD##*/} \033[0m ]"

[[ "$tmpDEBUG" != "2" ]] && [[ "$tmpTARGETMODE" != "1" ]] && [[ "$tmpTARGETMODE" != '4' ]] && [[ "$tmpTARGETMODE" != '5' ]] && [[ "$tmpTARGETMODE" != '10' ]] && {
  printf "\n ✔ %-30s" "Copying vmlinuz ......" && [[ "$tmpBUILD" != "1" ]] && { [[ -d $instto ]] && cp -f $topdir/$downdir/debianbase/vmlinuz$([ "$tmpHOSTARCH" == '1' -a "$tmpHOSTARCH" != '' ]  && echo -n _arm64) $instto/vmlinuz_1kddinst && echo -en "[ \033[32m done. \033[0m ]" || exit 1; } || { cp -f $topdir/$downdir/debianbase/vmlinuz$([ "$tmpHOSTARCH" == '1' -a "$tmpHOSTARCH" != '' ]  && echo -n _arm64) $topdir/$remasteringdir/boot/vmlinuz_1kddinst && echo -en "[ \033[32m done. \033[0m ]" || exit 1; }
  sleep 2 && printf "\n ✔ %-30s" "Copying initrfs ......" && [[ "$tmpBUILD" != "1" ]] && { [[ -d $instto ]] && cp -f $topdir/$downdir/debianbase/initrfs$([ "$tmpHOSTARCH" == '1' -a "$tmpHOSTARCH" != '' ]  && echo -n _arm64).img $instto/initrfs_1kddinst.img && echo -en "[ \033[32m done. \033[0m ]" || exit 1; } || { cp -f $topdir/$downdir/debianbase/initrfs$([ "$tmpHOSTARCH" == '1' -a "$tmpHOSTARCH" != '' ]  && echo -n _arm64).img $topdir/$remasteringdir/boot/initrfs_1kddinst.img && echo -en "[ \033[32m done. \033[0m ]" || exit 1; }
}

[[ "$tmpTARGETMODE" == '5' ]] && {
  printf "\n ✔ %-30s" "Copying vmlinuz ......" && { [[ -d $instto ]] && cat $topdir/_build/debianbase/dists/bullseye/main-debian-installer/$([ "$tmpHOSTARCH" == '1' -a "$tmpHOSTARCH" != '' ]  && echo -n binary-arm64 || echo -n binary-amd64)/tarball/vmlinuz$([ "$tmpHOSTARCH" == '1' -a "$tmpHOSTARCH" != '' ]  && echo -n _arm64)_* > $instto/vmlinuz_1kddinst && echo -en "[ \033[32m done. \033[0m ]"; }
  sleep 2 && printf "\n ✔ %-30s" "Copying initrfs ......" && { [[ -d $instto ]] && cat $topdir/_build/debianbase/dists/bullseye/main-debian-installer/$([ "$tmpHOSTARCH" == '1' -a "$tmpHOSTARCH" != '' ]  && echo -n binary-arm64 || echo -n binary-amd64)/tarball/initrfs$([ "$tmpHOSTARCH" == '1' -a "$tmpHOSTARCH" != '' ]  && echo -n _arm64).img_* > $instto/initrfs_1kddinst.img && echo -en "[ \033[32m done. \033[0m ]"; }
}

[[ "$tmpDEBUG" != "2" ]] && [[ "$tmpTARGETMODE" != '1' || "$tmpBUILDINSTTEST" == '1' ]] && [[ "$tmpBUILD" != '1' && "$tmpBUILD" != "11" ]] && [[ "$tmpTARGETMODE" != '4' ]] && [[ "$tmpTARGETMODE" != '10' ]] && {

  chown root:root $GRUBDIR/$GRUBFILE
  chmod 444 $GRUBDIR/$GRUBFILE
  printf "\n ✔ %-30s" "Prepare grub-reboot for $REBOOTNO ... " && { [[ -f /usr/sbin/grub-reboot ]] && sudo grub-reboot $REBOOTNO >/dev/null 2>&1;[[ -f /usr/sbin/grub2-reboot ]] && sudo grub2-reboot $REBOOTNO >/dev/null 2>&1;[[ ! -f /usr/sbin/grub-reboot && ! -f /usr/sbin/grub2-reboot ]] && echo grub-reboot or grub2-reboot not found && exit 1; }

  trap 'echo; echo "- aborting by user, restoreall"; restoreall;exit 1' SIGINT

  printf "\n ✔ %-30s" "Preparation done! `echo -n \" wait till auto reboot after 20s,or ctlc to interrupt \"`......"
  echo;echo -en "[ \033[32m after reboot, it will enter online $( [[ "$tmpTARGETMODE" == '0' ]] && echo install;[[ "$tmpTARGETMODE" == '2' ]] && echo restore) mode: "
  printf "\n %-20s" "`echo -en \" \033[32m if netcfg valid,open and refresh http://$( [[ "$FORCENETCFGV6ONLY" != '1' ]] && echo publicIPv4ofthisserver:80 || echo [publicIPv6ofthisserver:80]) for novncview\033[0m $([[ "$tmpINSTWITHMANUAL" != '1' ]] && echo ])  \"`"
  [[ "$tmpINSTWITHMANUAL" == '1' && "$tmpINSTWITHBORE" == '' ]] && printf "\n %-20s" "`echo -en \" \033[32m if netcfg valid,connected to sshd@publicIPofthisserver:22 without passwords\033[0m \"`"
  [[ "$tmpINSTWITHMANUAL" == '1' && "$tmpINSTWITHBORE" != '' ]] && printf "\n %-20s" "`echo -en \" \033[32m if netcfg valid,connected to sshd@publicIPofthisserver:22 or boresrvip:22 without passwords\033[0m \"`"
  [[ "$tmpINSTWITHMANUAL" == '1' ]] && printf "\n %-20s" "`echo -en \" \033[32m if netcfg unvalid,the system will roll to normal current running os after 5 mins\033[0m \033[0m ] \"`"

  reboot -f >/dev/null 2>&1;
}

[[ "$tmpBUILD" == "11" ]] && [[ "$tmpTARGETMODE" != "1" ]] && {
  printf "\n ✔ %-30s" "Prepare reboot ... " && { GRUBID=`bcdedit /enum ACTIVE|sed 's/\r//g'|tail -n4|head -n 1|awk -F ' ' '{ print $2}'`;bcdedit /bootsequence $GRUBID /addfirst; }
  trap 'echo; echo "- aborting by user, restoreall"; restoreall;exit 1' SIGINT
  printf "\n ✔ %-30s" "Preparation done! `echo -n \" wait till auto reboot after 20s,or ctlc to interrupt \"`......"
  shutdown -t 0 -r -f >/dev/null 2>&1;
}

[[ "$tmpBUILD" == "1" ]] && [[ "$tmpTARGETMODE" != "1" ]] && {
  [[ ! -d /Volumes/EFI ]] && sudo diskutil mount /dev/disk0s1
  [[ ! -d /Volumes/EFI ]] && echo efipartiation cloudnt be mount !! && exit 1
  printf "\n ✔ %-30s" "Prepare reboot ... " && { sudo grub-mkstandalone -o /Volumes/EFI/out.efi -O x86_64-efi /vmlinuz_1kddinst=$topdir/$remasteringdir/boot/vmlinuz_1kddinst /initrfs_1kddinst.img=$topdir/$remasteringdir/boot/initrfs_1kddinst.img /boot/grub/grub.cfg=$topdir/$remasteringdir/boot/grub.new;sudo bless --mount /Volumes/EFI --setBoot --file /Volumes/EFI/out.efi --shortform; }
  trap 'echo; echo "- aborting by user, restoreall"; restoreall;exit 1' SIGINT
  printf "\n ✔ %-30s" "Preparation done! `echo -n \" wait till auto reboot after 20s,or ctlc to interrupt \"`......"
  reboot -f >/dev/null 2>&1;
}

[[ "$tmpTARGETMODE" == '4' && "$tmpTARGET" != 'devdeskde' ]] && {

  printf "\n ✔ %-30s" "Preparation done! `echo -n \" press anykey to reboot, your sys are replaced \"`......"
  read -n1 </dev/tty
  sudo reboot -f >/dev/null 2>&1;

}

[[ "$tmpTARGETMODE" == '4' && "$tmpTARGET" == 'devdeskde' ]] && {

  trap 'echo; echo "- Ejecting tmpdev disk(linux)"; \
  umount "$tmpMNT"_p2 "$tmpMNT"_p3 "$tmpMNT"_p4 "$tmpMNT"_p5 && losetup -d "$tmpDEV" && rm -rf "$tmpMNT"_p2 "$tmpMNT"_p3 "$tmpMNT"_p4 "$tmpMNT"_p5' EXIT

  trap 'echo; echo "- aborting by user"; exit 1' SIGINT

  printf "\n ✔ %-30s" "Preparation done! `echo -n \" press anykey to esc,your sys are produced \"`"
  read -n1 </dev/tty
  exit

}

[[ "$tmpDEBUG" == "2" ]] && {

  eval "$rescuecommandstring"

  printf "\n ✔ %-30s" "Preparation done! `echo -n \" manually reboot,your sys are produced \"`"
  read -n1 </dev/tty
  exit
}

  exit
}